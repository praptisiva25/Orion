
using BankingAPI.Data;
using BankingAPI.DTOs.Customer;
using BankingAPI.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using BankingAPI.Services;

namespace BankingAPI.Controllers;

[ApiController]
[Route("api/customer")]
[Authorize]
public class CustomerController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly AuditLogService _auditLog;

    public CustomerController(
        ApplicationDbContext db,
        UserManager<ApplicationUser> userManager, AuditLogService auditLog)
    {
        _db = db;
        _userManager = userManager;
         _auditLog = auditLog;
    }

    [HttpGet("profile")]
    public async Task<IActionResult> GetProfile()
    {
        var userId = int.Parse(
            User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var profile = await _db.CustomerProfiles
            .FirstOrDefaultAsync(p => p.UserId == userId);

        if (profile == null)
            return NotFound(new { message = "Profile not found." });

        var user = await _userManager.FindByIdAsync(userId.ToString());

        if (user == null)
            return NotFound(new { message = "User not found." });

        var response = new CustomerProfileResponseDto
        {
            Id = profile.Id,
            FullName = user.FullName,
            Email = user.Email!,
            PhoneNumber = profile.PhoneNumber,
            Address = profile.Address,
            City = profile.City,
            State = profile.State,
            PostalCode = profile.PostalCode,
            DateOfBirth = profile.DateOfBirth,
            UpdatedAt = profile.UpdatedAt
        };

        return Ok(response);
    }

    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile(
        CustomerProfileRequestDto request)
    {
        var userId = int.Parse(
            User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var profile = await _db.CustomerProfiles
            .FirstOrDefaultAsync(p => p.UserId == userId);

        await using var transaction = await _db.Database.BeginTransactionAsync();
        if (profile == null)
        {
            profile = new CustomerProfile { UserId = userId };
            _db.CustomerProfiles.Add(profile);
        }

        profile.PhoneNumber = request.PhoneNumber;
        profile.Address = request.Address;
        profile.City = request.City;
        profile.State = request.State;
        profile.PostalCode = request.PostalCode;
        profile.DateOfBirth = request.DateOfBirth;
        profile.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        await _auditLog.LogAsync(
            userId,
            "Customer Profile Updated",
            "CustomerProfile",
            profile.Id,
            "Customer updated their profile."
        );
        await transaction.CommitAsync();

        var user = await _userManager.FindByIdAsync(userId.ToString());

        if (user == null)
            return NotFound(new { message = "User not found." });

        var response = new CustomerProfileResponseDto
        {
            Id = profile.Id,
            FullName = user.FullName,
            Email = user.Email!,
            PhoneNumber = profile.PhoneNumber,
            Address = profile.Address,
            City = profile.City,
            State = profile.State,
            PostalCode = profile.PostalCode,
            DateOfBirth = profile.DateOfBirth,
            UpdatedAt = profile.UpdatedAt
        };

        return Ok(new
        {
            message = "Profile updated successfully.",
            profile = response
        });
    }
}
