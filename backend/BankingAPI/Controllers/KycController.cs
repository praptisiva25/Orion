
using BankingAPI.Data;
using BankingAPI.DTOs.Kyc;
using BankingAPI.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using BankingAPI.Services;

namespace BankingAPI.Controllers;

[ApiController]
[Route("api/kyc")]
[Authorize]
public class KycController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly IWebHostEnvironment _environment;
    private readonly AuditLogService _auditLog;
    private readonly NotificationService _notificationService;

    public KycController(
        ApplicationDbContext db,
        IWebHostEnvironment environment,
        AuditLogService auditLog, 
        NotificationService notificationService)
    {
        _db = db;
        _environment = environment;
        _auditLog = auditLog;
        _notificationService = notificationService;
    }

    // Customer uploads KYC document
    [HttpPost("upload")]
    [RequestSizeLimit(5_000_000)]
    public async Task<IActionResult> Upload(
        IFormFile file,
        [FromForm] KycUploadRequestDto request)
    {
        var allowedTypes = new[] { "PAN", "Aadhaar" };

        if (!allowedTypes.Contains(request.DocumentType))
            return BadRequest(new
            {
                message = "Invalid document type."
            });

        if (file == null || file.Length == 0 ||
            file.Length > 5_000_000)
        {
            return BadRequest(new
            {
                message = "File must be between 1 byte and 5 MB."
            });
        }

        var extension = Path.GetExtension(file.FileName)
            .ToLowerInvariant();

        if (extension != ".pdf" && extension != ".jpg" &&
            extension != ".jpeg" && extension != ".png")
        {
            return BadRequest(new
            {
                message = "Only PDF, JPG and PNG files are allowed."
            });
        }

        var header = new byte[8];
        await using (var validationStream = file.OpenReadStream())
        {
            var bytesRead = await validationStream.ReadAsync(header);
            if (!HasExpectedSignature(extension, header, bytesRead))
                return BadRequest(new
                {
                    message = "The file content does not match its extension."
                });
        }

        var userId = int.Parse(
            User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var uploadPath = Path.Combine(
            _environment.ContentRootPath,
            "PrivateUploads",
            "Kyc");

        Directory.CreateDirectory(uploadPath);

        var storedFileName = $"{Guid.NewGuid()}{extension}";
        var fullPath = Path.Combine(uploadPath, storedFileName);

        try
        {
            using (var stream = new FileStream(
                fullPath, FileMode.CreateNew))
            {
                await file.CopyToAsync(stream);
            }

            var document = new KycDocument
            {
                UserId = userId,
                DocumentType = request.DocumentType,
                FileName = Path.GetFileName(file.FileName),
                FilePath = fullPath,
                Status = "Pending"
            };

            _db.KycDocuments.Add(document);
            await _db.SaveChangesAsync();

            await _auditLog.LogAsync(
                userId,
                "KYC Document Uploaded",
                "KycDocument",
                document.Id,
                $"Customer uploaded a {document.DocumentType} document."
            );

            await _notificationService.CreateAsync(
                document.UserId,
                $"KYC Document {document.Status}",
                $"Your {document.DocumentType} document has been {document.Status.ToLower()}."
            );
            return Ok(new
            {
                message = "KYC document uploaded successfully.",
                document = new KycDocumentResponseDto
                {
                    Id = document.Id,
                    DocumentType = document.DocumentType,
                    FileName = document.FileName,
                    Status = document.Status,
                    UploadedAt = document.UploadedAt,
                    ReviewedAt = document.ReviewedAt
                }
            });
        }
        catch
        {
            if (System.IO.File.Exists(fullPath))
                System.IO.File.Delete(fullPath);

            throw;
        }
    }

    // Customer views their own documents
    [HttpGet("my")]
    public async Task<ActionResult<List<KycDocumentResponseDto>>>
        GetMyDocuments()
    {
        var userId = int.Parse(
            User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var documents = await _db.KycDocuments
            .Where(d => d.UserId == userId)
            .OrderByDescending(d => d.UploadedAt)
            .Select(d => new KycDocumentResponseDto
            {
                Id = d.Id,
                DocumentType = d.DocumentType,
                FileName = d.FileName,
                Status = d.Status,
                UploadedAt = d.UploadedAt,
                ReviewedAt = d.ReviewedAt,
                ReviewReason = d.ReviewReason
            })
            .ToListAsync();

        return Ok(documents);
    }

    // Admin and Officer view all documents
    [HttpGet("all")]
    [Authorize(Roles = "Admin,Officer")]
    public async Task<ActionResult<List<KycDocumentResponseDto>>>
        GetAllDocuments()
    {
        var documents = await (
            from document in _db.KycDocuments.AsNoTracking()
            join customer in _db.Users.AsNoTracking()
                on document.UserId equals customer.Id
            orderby document.UploadedAt descending
            select new KycDocumentResponseDto
            {
                Id = document.Id,
                UserId = document.UserId,
                CustomerName = customer.FullName,
                CustomerEmail = customer.Email,
                DocumentType = document.DocumentType,
                FileName = document.FileName,
                Status = document.Status,
                UploadedAt = document.UploadedAt,
                ReviewedAt = document.ReviewedAt,
                ReviewReason = document.ReviewReason,
                ReviewerName = _db.Users.Where(u => u.Id == document.ReviewedBy)
                    .Select(u => u.FullName).FirstOrDefault()
            })
            .ToListAsync();

        return Ok(documents);
    }

    [HttpGet("review-history")]
    [Authorize(Roles = "Admin,Officer")]
    public async Task<IActionResult> GetReviewHistory([FromQuery] string? status, [FromQuery] string? documentType,
        [FromQuery] string? customer, [FromQuery] DateTime? fromDate, [FromQuery] DateTime? toDate)
    {
        var query = from document in _db.KycDocuments.AsNoTracking()
                    join customerUser in _db.Users.AsNoTracking() on document.UserId equals customerUser.Id
                    where document.Status == "Verified" || document.Status == "Rejected"
                    select new { document, customerUser };
        if (!string.IsNullOrWhiteSpace(status) && status != "All")
        {
            if (status is not ("Verified" or "Rejected")) return BadRequest("Invalid review status.");
            query = query.Where(x => x.document.Status == status);
        }
        if (!string.IsNullOrWhiteSpace(documentType)) query = query.Where(x => x.document.DocumentType == documentType);
        if (!string.IsNullOrWhiteSpace(customer)) query = query.Where(x => x.customerUser.FullName.Contains(customer) || x.customerUser.Email!.Contains(customer));
        if (fromDate.HasValue) query = query.Where(x => x.document.UploadedAt >= fromDate.Value);
        if (toDate.HasValue) query = query.Where(x => x.document.UploadedAt < toDate.Value.Date.AddDays(1));
        var results = await query.OrderByDescending(x => x.document.ReviewedAt).Select(x => new KycDocumentResponseDto
        {
            Id = x.document.Id, UserId = x.document.UserId, CustomerName = x.customerUser.FullName,
            CustomerEmail = x.customerUser.Email, DocumentType = x.document.DocumentType, FileName = x.document.FileName,
            Status = x.document.Status, UploadedAt = x.document.UploadedAt, ReviewedAt = x.document.ReviewedAt,
            ReviewReason = x.document.ReviewReason,
            ReviewerName = _db.Users.Where(u => u.Id == x.document.ReviewedBy).Select(u => u.FullName).FirstOrDefault()
        }).ToListAsync();
        return Ok(results);
    }

    // Reviewer file access is authenticated and never returns the stored path.
    [HttpGet("{id:int}/file")]
    [Authorize(Roles = "Admin,Officer")]
    public async Task<IActionResult> GetDocumentFile(
        int id,
        [FromQuery] bool download = false)
    {
        var document = await _db.KycDocuments
            .AsNoTracking()
            .Where(d => d.Id == id)
            .Select(d => new { d.FilePath, d.FileName })
            .FirstOrDefaultAsync();

        if (document == null)
            return NotFound(new { message = "Document not found." });

        var extension = Path.GetExtension(document.FileName).ToLowerInvariant();
        var contentType = extension switch
        {
            ".pdf" => "application/pdf",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            _ => null
        };

        if (contentType == null)
            return BadRequest(new { message = "Stored document type is not supported." });

        string fullPath;
        string rootPath;
        try
        {
            rootPath = Path.GetFullPath(Path.Combine(
                _environment.ContentRootPath, "PrivateUploads", "Kyc"));
            fullPath = Path.GetFullPath(document.FilePath);
        }
        catch (Exception ex) when (ex is ArgumentException or NotSupportedException or PathTooLongException)
        {
            return NotFound(new { message = "Document file is unavailable." });
        }

        var rootPrefix = rootPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
            + Path.DirectorySeparatorChar;
        if (!fullPath.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase) ||
            !System.IO.File.Exists(fullPath))
        {
            return NotFound(new { message = "Document file is unavailable." });
        }

        await using (var stream = System.IO.File.OpenRead(fullPath))
        {
            var header = new byte[8];
            var bytesRead = await stream.ReadAsync(header);
            if (!HasExpectedSignature(extension, header, bytesRead))
                return BadRequest(new { message = "Stored file content does not match its type." });
        }

        var safeFileName = Path.GetFileName(document.FileName).Replace("\"", "");
        var disposition = download ? "attachment" : "inline";
        Response.Headers["Content-Disposition"] =
            $"{disposition}; filename*=UTF-8''{Uri.EscapeDataString(safeFileName)}";
        Response.Headers["X-Content-Type-Options"] = "nosniff";

        return PhysicalFile(fullPath, contentType, enableRangeProcessing: true);
    }

    // Admin and Officer review documents
    [HttpPut("{id:int}/review")]
    [Authorize(Roles = "Admin,Officer")]
    public async Task<IActionResult> ReviewDocument(
        int id,
        KycReviewRequestDto request)
    {
        var document = await _db.KycDocuments
            .FirstOrDefaultAsync(d => d.Id == id);

        if (document == null)
            return NotFound(new
            {
                message = "Document not found."
            });

        if (document.Status != "Pending")
            return BadRequest(new
            {
                message = "Only pending documents can be reviewed."
            });

        var reviewReason = request.ReviewReason?.Trim();
        if (request.Status == "Rejected" && string.IsNullOrWhiteSpace(reviewReason))
            return BadRequest(new { message = "A reason is required when rejecting a document." });

        var reviewerId = int.Parse(
            User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var reviewedAt = DateTime.UtcNow;
        await using var transaction = await _db.Database.BeginTransactionAsync();
        var updated = await _db.KycDocuments
            .Where(d => d.Id == id && d.Status == "Pending")
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(d => d.Status, request.Status)
                .SetProperty(d => d.ReviewedAt, reviewedAt)
                .SetProperty(d => d.ReviewedBy, reviewerId)
                .SetProperty(d => d.ReviewReason,
                    request.Status == "Rejected" ? reviewReason : null));

        if (updated == 0)
            return Conflict(new { message = "This document has already been reviewed." });

        var notificationMessage = request.Status == "Rejected"
            ? $"Your {document.DocumentType} document was rejected. Reason: {reviewReason}"
            : $"Your {document.DocumentType} document has been verified.";

        await _auditLog.LogAsync(
            reviewerId, $"KYC Document {request.Status}", "KycDocument", id,
            $"Reviewer marked the {document.DocumentType} document as {request.Status}." +
            (reviewReason == null ? string.Empty : $" Reason: {reviewReason}"));
        await _notificationService.CreateAsync(
            document.UserId, $"KYC Document {request.Status}", notificationMessage);
        await transaction.CommitAsync();

        return Ok(new
        {
            message = "KYC document reviewed successfully.",
            document = new
            {
                document.Id,
                status = request.Status,
                reviewedAt
            }
        });
    }

    private static bool HasExpectedSignature(string extension, byte[] header, int bytesRead)
    {
        return extension switch
        {
            ".pdf" => bytesRead >= 5 && header.AsSpan(0, 5).SequenceEqual("%PDF-"u8),
            ".jpg" or ".jpeg" => bytesRead >= 3 && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF,
            ".png" => bytesRead >= 8 && header.AsSpan(0, 8).SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }),
            _ => false
        };
    }
}
