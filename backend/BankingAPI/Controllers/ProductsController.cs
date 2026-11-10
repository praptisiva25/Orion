
using BankingAPI.Data;
using BankingAPI.DTOs.Products;
using BankingAPI.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using BankingAPI.Services;
using System.Security.Claims;

namespace BankingAPI.Controllers;

[ApiController]
[Route("api/products")]
public class ProductsController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly AuditLogService _auditLog;

    public ProductsController(ApplicationDbContext db, AuditLogService auditLog)
    {
        _db = db;
        _auditLog = auditLog;
    }

    // List active products
    [HttpGet]
    [AllowAnonymous]
    public async Task<ActionResult<List<ProductResponseDto>>> GetProducts()
    {
        var products = await _db.BankingProducts
            .Where(p => p.IsActive)
            .Select(p => new ProductResponseDto
            {
                Id = p.Id,
                Name = p.Name,
                Category = p.Category,
                Description = p.Description,
                InterestRate = p.InterestRate,
                MinimumAmount = p.MinimumAmount,
                IsActive = p.IsActive,
                CreatedAt = p.CreatedAt
            })
            .ToListAsync();

        return Ok(products);
    }

    // Get product by ID
    [HttpGet("{id:int}")]
    [AllowAnonymous]
    public async Task<ActionResult<ProductResponseDto>> GetProduct(int id)
    {
        var product = await _db.BankingProducts
            .Where(p => p.Id == id && p.IsActive)
            .Select(p => new ProductResponseDto
            {
                Id = p.Id,
                Name = p.Name,
                Category = p.Category,
                Description = p.Description,
                InterestRate = p.InterestRate,
                MinimumAmount = p.MinimumAmount,
                IsActive = p.IsActive,
                CreatedAt = p.CreatedAt
            })
            .FirstOrDefaultAsync();

        if (product == null)
            return NotFound(new { message = "Product not found." });

        return Ok(product);
    }

    [HttpGet("admin")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<List<ProductResponseDto>>> GetAllProductsForAdmin()
    {
        return Ok(await _db.BankingProducts.AsNoTracking()
            .OrderBy(p => p.Name)
            .Select(p => new ProductResponseDto
            {
                Id = p.Id,
                Name = p.Name,
                Category = p.Category,
                Description = p.Description,
                InterestRate = p.InterestRate,
                MinimumAmount = p.MinimumAmount,
                IsActive = p.IsActive,
                CreatedAt = p.CreatedAt
            }).ToListAsync());
    }

    // Create product (Admin only)
    [HttpPost]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<ProductResponseDto>> CreateProduct(
        CreateProductRequestDto request)
    {
        if (!await IsSupportedCategory(request.Category))
            return BadRequest(new { message = "Choose a supported product category or an existing category." });
        var product = new BankingProduct
        {
            Name = request.Name,
            Category = request.Category,
            Description = request.Description,
            InterestRate = request.InterestRate,
            MinimumAmount = request.MinimumAmount
        };

        await using var transaction = await _db.Database.BeginTransactionAsync();
        _db.BankingProducts.Add(product);
        await _db.SaveChangesAsync();

        var adminId = int.Parse(
            User.FindFirstValue(ClaimTypes.NameIdentifier)!
        );
        
        await _auditLog.LogAsync(
            adminId,
            "Banking Product Created",
            "BankingProduct",
            product.Id,
            $"Admin created the {product.Name} product."
        );
        await transaction.CommitAsync();

        var response = new ProductResponseDto
        {
            Id = product.Id,
            Name = product.Name,
            Category = product.Category,
            Description = product.Description,
            InterestRate = product.InterestRate,
            MinimumAmount = product.MinimumAmount,
            IsActive = product.IsActive,
            CreatedAt = product.CreatedAt
        };

        return CreatedAtAction(
            nameof(GetProduct),
            new { id = product.Id },
            response);
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> UpdateProduct(int id, CreateProductRequestDto request)
    {
        if (!await IsSupportedCategory(request.Category))
            return BadRequest(new { message = "Choose a supported product category or an existing category." });
        var product = await _db.BankingProducts.FirstOrDefaultAsync(p => p.Id == id);
        if (product == null) return NotFound(new { message = "Product not found." });
        await using var transaction = await _db.Database.BeginTransactionAsync();
        product.Name = request.Name.Trim();
        product.Category = request.Category.Trim();
        product.Description = request.Description.Trim();
        product.InterestRate = request.InterestRate;
        product.MinimumAmount = request.MinimumAmount;
        await _db.SaveChangesAsync();
        var adminId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        await _auditLog.LogAsync(adminId, "Banking Product Updated", "BankingProduct", id,
            $"Admin updated the {product.Name} product.");
        await transaction.CommitAsync();
        return Ok(new { message = "Product updated.", product = ToResponse(product) });
    }

    [HttpPut("{id:int}/status")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> UpdateProductStatus(int id, [FromQuery] bool isActive)
    {
        var product = await _db.BankingProducts.FirstOrDefaultAsync(p => p.Id == id);
        if (product == null) return NotFound(new { message = "Product not found." });
        if (product.IsActive == isActive)
            return BadRequest(new { message = "Product already has this status." });
        await using var transaction = await _db.Database.BeginTransactionAsync();
        product.IsActive = isActive;
        await _db.SaveChangesAsync();
        var adminId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        await _auditLog.LogAsync(adminId, isActive ? "Banking Product Activated" : "Banking Product Deactivated",
            "BankingProduct", id, $"Admin changed product status to {(isActive ? "Active" : "Inactive")}.");
        await transaction.CommitAsync();
        return Ok(new { message = "Product status updated.", product = ToResponse(product) });
    }

    private static ProductResponseDto ToResponse(BankingProduct product) => new()
    {
        Id = product.Id,
        Name = product.Name,
        Category = product.Category,
        Description = product.Description,
        InterestRate = product.InterestRate,
        MinimumAmount = product.MinimumAmount,
        IsActive = product.IsActive,
        CreatedAt = product.CreatedAt
    };

    private async Task<bool> IsSupportedCategory(string category) =>
        new[] { "Loan", "Account", "Deposit" }.Contains(category.Trim(), StringComparer.OrdinalIgnoreCase) ||
        await _db.BankingProducts.AnyAsync(p => p.Category == category.Trim());
}
