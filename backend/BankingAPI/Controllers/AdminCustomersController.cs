using System.Security.Claims;
using BankingAPI.Data;
using BankingAPI.DTOs.Admin;
using BankingAPI.Models;
using BankingAPI.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BankingAPI.Controllers;

[ApiController]
[Route("api/admin/customers")]
[Authorize(Roles = "Admin")]
public class AdminCustomersController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly AuditLogService _auditLog;

    public AdminCustomersController(ApplicationDbContext db, UserManager<ApplicationUser> userManager, AuditLogService auditLog)
    {
        _db = db;
        _userManager = userManager;
        _auditLog = auditLog;
    }

    [HttpGet]
    public async Task<ActionResult<List<CustomerAdminDto>>> GetCustomers([FromQuery] string? search, [FromQuery] bool? isActive)
    {
        var query = from userRole in _db.UserRoles
                    join role in _db.Roles on userRole.RoleId equals role.Id
                    join user in _db.Users.AsNoTracking() on userRole.UserId equals user.Id
                    join profile in _db.CustomerProfiles.AsNoTracking() on user.Id equals profile.UserId into profiles
                    from profile in profiles.DefaultIfEmpty()
                    where role.Name == "Customer"
                    select new CustomerAdminDto
                    {
                        Id = user.Id,
                        FullName = user.FullName,
                        Email = user.Email ?? string.Empty,
                        IsActive = user.IsActive,
                        CreatedAt = user.CreatedAt,
                        PhoneNumber = profile == null ? string.Empty : profile.PhoneNumber,
                        Address = profile == null ? string.Empty : profile.Address,
                        City = profile == null ? string.Empty : profile.City,
                        State = profile == null ? string.Empty : profile.State,
                        PostalCode = profile == null ? string.Empty : profile.PostalCode,
                        DateOfBirth = profile == null ? null : profile.DateOfBirth
                    };

        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(c => c.FullName.Contains(search) || c.Email.Contains(search));
        if (isActive.HasValue)
            query = query.Where(c => c.IsActive == isActive.Value);

        return Ok(await query.OrderBy(c => c.FullName).ToListAsync());
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<CustomerAdminDto>> GetCustomer(int id)
    {
        var customer = await (from userRole in _db.UserRoles
                              join role in _db.Roles on userRole.RoleId equals role.Id
                              join user in _db.Users.AsNoTracking() on userRole.UserId equals user.Id
                              join profile in _db.CustomerProfiles.AsNoTracking() on user.Id equals profile.UserId into profiles
                              from profile in profiles.DefaultIfEmpty()
                              where role.Name == "Customer" && user.Id == id
                              select new CustomerAdminDto
                              {
                                  Id = user.Id,
                                  FullName = user.FullName,
                                  Email = user.Email ?? string.Empty,
                                  IsActive = user.IsActive,
                                  CreatedAt = user.CreatedAt,
                                  PhoneNumber = profile == null ? string.Empty : profile.PhoneNumber,
                                  Address = profile == null ? string.Empty : profile.Address,
                                  City = profile == null ? string.Empty : profile.City,
                                  State = profile == null ? string.Empty : profile.State,
                                  PostalCode = profile == null ? string.Empty : profile.PostalCode,
                                  DateOfBirth = profile == null ? null : profile.DateOfBirth
                              }).FirstOrDefaultAsync();
        return customer == null ? NotFound() : Ok(customer);
    }

    [HttpPut("{id:int}/status")]
    public async Task<IActionResult> UpdateCustomerStatus(int id, [FromQuery] bool isActive)
    {
        var customer = await _userManager.FindByIdAsync(id.ToString());
        if (customer == null || !await _userManager.IsInRoleAsync(customer, "Customer"))
            return NotFound(new { message = "Customer not found." });
        if (customer.IsActive == isActive)
            return BadRequest(new { message = "Customer already has this status." });

        customer.IsActive = isActive;
        var result = await _userManager.UpdateAsync(customer);
        if (!result.Succeeded)
            return BadRequest(new { errors = result.Errors.Select(e => e.Description) });

        var adminId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        await _auditLog.LogAsync(adminId, isActive ? "Customer Activated" : "Customer Deactivated", "ApplicationUser", id,
            $"Admin changed customer account status to {(isActive ? "Active" : "Inactive")}.");
        return Ok(new { message = $"Customer {(isActive ? "activated" : "deactivated")} successfully.", id, isActive });
    }
}
