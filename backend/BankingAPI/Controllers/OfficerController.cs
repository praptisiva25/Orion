
using BankingAPI.DTOs.Admin;
using BankingAPI.Data;
using BankingAPI.Models;
using BankingAPI.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace BankingAPI.Controllers;

[ApiController]
[Route("api/admin/officers")]
[Authorize(Roles = "Admin")]
public class OfficerController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly AuditLogService _auditLog;
    private readonly ApplicationDbContext _db;

    public OfficerController(
        UserManager<ApplicationUser> userManager,
        AuditLogService auditLog,
        ApplicationDbContext db)
    {
        _userManager = userManager;
        _auditLog = auditLog;
        _db = db;
    }

    [HttpPost]
    public async Task<IActionResult> CreateOfficer(
        CreateOfficerRequestDto request)
    {
        var existingUser = await _userManager.FindByEmailAsync(request.Email);

        if (existingUser != null)
        {
            return BadRequest("An account with this email already exists.");
        }

        var officer = new ApplicationUser
        {
            UserName = request.Email,
            Email = request.Email,
            FullName = request.FullName,
            EmailConfirmed = false,
            IsActive = true
        };

        await using var transaction = await _db.Database.BeginTransactionAsync();
        var result = await _userManager.CreateAsync(
            officer,
            request.Password
        );

        if (!result.Succeeded)
        {
            return BadRequest(result.Errors.Select(e => e.Description));
        }

        var roleResult = await _userManager.AddToRoleAsync(
            officer,
            "Officer"
        );

        if (!roleResult.Succeeded)
        {
            await transaction.RollbackAsync();

            return BadRequest(
                roleResult.Errors.Select(e => e.Description)
            );
        }

        await _auditLog.LogAsync(
            int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!),
            "Officer Created",
            "ApplicationUser",
            officer.Id,
            $"Admin created officer account for {officer.Email}."
        );
        await transaction.CommitAsync();

        return Ok(new
        {
            message = "Officer account created successfully.",
            officerId = officer.Id,
            fullName = officer.FullName,
            email = officer.Email,
            role = "Officer"
        });
    }

    [HttpGet]
    public async Task<IActionResult> GetOfficers()
    {
        var officers = await _userManager.GetUsersInRoleAsync("Officer");
        var result = officers.Select(officer => new
        {
            officer.Id,
            officer.FullName,
            officer.Email,
            officer.IsActive,
            officer.CreatedAt
        }).ToList();
            
        return Ok(result);
    }

    [HttpPut("{id:int}/status")]
    public async Task<IActionResult> UpdateOfficerStatus(
        int id,
        [FromQuery] bool isActive)
    {
        var officer = await _userManager.FindByIdAsync(id.ToString());
        
        if (officer == null || !await _userManager.IsInRoleAsync(officer, "Officer"))
        {
            return NotFound("Officer not found.");
        }
        
        if (officer.IsActive == isActive)
        {
            return BadRequest("Officer already has this status.");
        }
        
        await using var transaction = await _db.Database.BeginTransactionAsync();
        officer.IsActive = isActive;

        var result = await _userManager.UpdateAsync(officer);
        if (!result.Succeeded)
        {
            return BadRequest(result.Errors.Select(e => e.Description));
        }
        
        var adminId = int.Parse(
        User.FindFirstValue(ClaimTypes.NameIdentifier)!
        );
        
        await _auditLog.LogAsync(
            adminId,
            isActive ? "Officer Activated" : "Officer Deactivated",
            "ApplicationUser",
            officer.Id,
            $"Admin changed officer status to {(isActive ? "Active" : "Inactive")}."
        );
        await transaction.CommitAsync();
        
        return Ok(new
        {
            message = $"Officer {(isActive ? "activated" : "deactivated")} successfully.",
            officerId = officer.Id,
            isActive = officer.IsActive
        });
    }
}
