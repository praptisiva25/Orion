
using BankingAPI.Data;
using BankingAPI.DTOs.Applications;
using BankingAPI.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using BankingAPI.Services;

namespace BankingAPI.Controllers;

[ApiController]
[Route("api/applications")]
[Authorize]
public class ApplicationsController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly AuditLogService _auditLog;
    private readonly NotificationService _notificationService;

    public ApplicationsController(ApplicationDbContext db,  AuditLogService auditLog, NotificationService notificationService)
    {
        _db = db;
        _auditLog = auditLog;
        _notificationService = notificationService;

    }

    // Customer submits an application
    [HttpPost]
    public async Task<IActionResult> Submit(
        CreateApplicationRequestDto request)
    {
        var userId = int.Parse(
            User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var product = await _db.BankingProducts
            .FirstOrDefaultAsync(p =>
                p.Id == request.BankingProductId && p.IsActive);

        if (product == null)
            return NotFound(new { message = "Product not found." });

        if (request.RequestedAmount < product.MinimumAmount)
            return BadRequest(new
            {
                message = $"Minimum application amount is {product.MinimumAmount}."
            });

        if (request.RequestedAmount <= 0)
            return BadRequest(new
            {
                message = "Amount must be greater than zero."
            });

        var application = new ProductApplication
        {
            UserId = userId,
            BankingProductId = request.BankingProductId,
            RequestedAmount = request.RequestedAmount,
            Remarks = request.Remarks,
            Status = "Pending"
        };

        _db.ProductApplications.Add(application);
        await _db.SaveChangesAsync();
        await _notificationService.CreateAsync(
            userId,
            "Application Submitted",
            $"Your application for {product.Name} has been submitted successfully."
        );
        await _auditLog.LogAsync(
            userId,
            "Application Submitted",
            "ProductApplication",
            application.Id,
            $"Customer submitted an application for product ID {application.BankingProductId}."
        );

        var response = new ApplicationResponseDto
        {
            Id = application.Id,
            UserId = application.UserId,
            BankingProductId = application.BankingProductId,
            Product = product.Name,
            RequestedAmount = application.RequestedAmount,
            Status = application.Status,
            Remarks = application.Remarks,
            AppliedAt = application.AppliedAt,
            ReviewedAt = application.ReviewedAt
        };

        return Ok(new
        {
            message = "Application submitted successfully.",
            application = response
        });
    }

    // Customer views their own applications
    [HttpGet("my")]
    public async Task<ActionResult<List<ApplicationResponseDto>>>
        GetMyApplications()
    {
        var userId = int.Parse(
            User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var applications = await _db.ProductApplications
            .Where(a => a.UserId == userId)
            .OrderByDescending(a => a.AppliedAt)
            .Select(a => new ApplicationResponseDto
            {
                Id = a.Id,
                UserId = a.UserId,
                BankingProductId = a.BankingProductId,
                Product = _db.BankingProducts
                 .Where(p => p.Id == a.BankingProductId)
                 .Select(p => p.Name)
                 .FirstOrDefault() ?? string.Empty,
                RequestedAmount = a.RequestedAmount,
                Status = a.Status,
                Remarks = a.Remarks,
                AppliedAt = a.AppliedAt,
                ReviewedAt = a.ReviewedAt,
                ReviewReason = a.ReviewReason
            })
            .ToListAsync();

        return Ok(applications);
    }

    // Admin and Officer review queue; customer data is limited to display fields.
    [HttpGet("review-queue")]
    [Authorize(Roles = "Admin,Officer")]
    public async Task<ActionResult<List<ApplicationResponseDto>>> GetReviewQueue()
    {
        var applications = await (
            from application in _db.ProductApplications.AsNoTracking()
            join customer in _db.Users.AsNoTracking()
                on application.UserId equals customer.Id
            join product in _db.BankingProducts.AsNoTracking()
                on application.BankingProductId equals product.Id
            where application.Status == "Pending"
            orderby application.AppliedAt
            select new ApplicationResponseDto
            {
                Id = application.Id,
                UserId = application.UserId,
                CustomerName = customer.FullName,
                CustomerEmail = customer.Email,
                BankingProductId = application.BankingProductId,
                Product = product.Name,
                RequestedAmount = application.RequestedAmount,
                Status = application.Status,
                Remarks = application.Remarks,
                AppliedAt = application.AppliedAt,
                ReviewedAt = application.ReviewedAt,
                ReviewReason = application.ReviewReason
            }).ToListAsync();

        return Ok(applications);
    }

    [HttpGet("review/{id:int}")]
    [Authorize(Roles = "Admin,Officer")]
    public async Task<ActionResult<ApplicationResponseDto>> GetReviewDetails(int id)
    {
        var application = await (
            from item in _db.ProductApplications.AsNoTracking()
            join customer in _db.Users.AsNoTracking() on item.UserId equals customer.Id
            join product in _db.BankingProducts.AsNoTracking() on item.BankingProductId equals product.Id
            where item.Id == id
            select new ApplicationResponseDto
            {
                Id = item.Id,
                UserId = item.UserId,
                CustomerName = customer.FullName,
                CustomerEmail = customer.Email,
                BankingProductId = item.BankingProductId,
                Product = product.Name,
                RequestedAmount = item.RequestedAmount,
                Status = item.Status,
                Remarks = item.Remarks,
                AppliedAt = item.AppliedAt,
                ReviewedAt = item.ReviewedAt,
                ReviewReason = item.ReviewReason
            }).FirstOrDefaultAsync();

        return application == null ? NotFound() : Ok(application);
    }

    // Admin views all applications
    [HttpGet("all")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<List<ApplicationResponseDto>>>
        GetAllApplications()
    {
        var applications = await (
            from application in _db.ProductApplications.AsNoTracking()
            join customer in _db.Users.AsNoTracking() on application.UserId equals customer.Id
            join product in _db.BankingProducts.AsNoTracking() on application.BankingProductId equals product.Id
            orderby application.AppliedAt descending
            select new ApplicationResponseDto
            {
                Id = application.Id,
                UserId = application.UserId,
                CustomerName = customer.FullName,
                CustomerEmail = customer.Email,
                BankingProductId = application.BankingProductId,
                Product = product.Name,
                RequestedAmount = application.RequestedAmount,
                Status = application.Status,
                Remarks = application.Remarks,
                AppliedAt = application.AppliedAt,
                ReviewedAt = application.ReviewedAt,
                ReviewReason = application.ReviewReason,
                ReviewerName = _db.Users.Where(u => u.Id == application.ReviewedBy)
                    .Select(u => u.FullName).FirstOrDefault()
            }).ToListAsync();

        return Ok(applications);
    }

    // Admin approves or rejects an application
    [HttpPut("{id:int}/status")]
    [Authorize(Roles = "Admin,Officer")]
    public async Task<IActionResult> UpdateStatus(
        int id,
        UpdateApplicationStatusRequestDto request)
    {
        var application = await _db.ProductApplications
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == id);

        if (application == null)
            return NotFound(new
            {
                message = "Application not found."
            });

        var reviewReason = request.ReviewReason?.Trim();
        if (request.Status == "Rejected" && string.IsNullOrWhiteSpace(reviewReason))
            return BadRequest(new { message = "A reason is required when rejecting an application." });

        var reviewerId = int.Parse(
            User.FindFirstValue(ClaimTypes.NameIdentifier)!
        );

        var reviewedAt = DateTime.UtcNow;
        await using var transaction = await _db.Database.BeginTransactionAsync();
        var updated = await _db.ProductApplications
            .Where(a => a.Id == id && a.Status == "Pending")
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(a => a.Status, request.Status)
                .SetProperty(a => a.ReviewedAt, reviewedAt)
                .SetProperty(a => a.ReviewedBy, reviewerId)
                .SetProperty(a => a.ReviewReason,
                    request.Status == "Rejected" ? reviewReason : null));

        if (updated == 0)
            return Conflict(new { message = "This application has already been reviewed." });

        await _auditLog.LogAsync(
            reviewerId,
            $"Application {request.Status}",
            "ProductApplication",
            application.Id,
            $"Reviewer changed application status to {request.Status}." +
            (reviewReason == null ? string.Empty : $" Reason: {reviewReason}")
        );

        var productName = await _db.BankingProducts
            .Where(p => p.Id == application.BankingProductId)
            .Select(p => p.Name)
            .FirstOrDefaultAsync() ?? "your product";
        var notificationMessage = request.Status == "Rejected"
            ? $"Your application for {productName} was rejected. Reason: {reviewReason}"
            : $"Your application for {productName} has been approved.";

        await _notificationService.CreateAsync(
            application.UserId,
            $"Application {request.Status}",
            notificationMessage
        );
        await transaction.CommitAsync();

        return Ok(new
        {
            message = "Application status updated.",
            application = new
            {
                application.Id,
                status = request.Status,
                reviewedAt,
                reviewReason
            }
        });
    }
}
