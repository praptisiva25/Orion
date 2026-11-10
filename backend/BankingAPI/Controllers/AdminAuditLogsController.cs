using BankingAPI.Data;
using BankingAPI.DTOs.Admin;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BankingAPI.Controllers;

[ApiController]
[Route("api/admin/audit-logs")]
[Authorize(Roles = "Admin")]
public class AdminAuditLogsController : ControllerBase
{
    private readonly ApplicationDbContext _db;

    public AdminAuditLogsController(ApplicationDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<List<AuditLogResponseDto>>> GetAuditLogs(
        [FromQuery] string? action,
        [FromQuery] string? search,
        [FromQuery] string? entityType,
        [FromQuery] string? category,
        [FromQuery] int? actorId,
        [FromQuery] int? entityId,
        [FromQuery] DateTime? fromDate,
        [FromQuery] DateTime? toDate,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        if (page < 1 || pageSize < 1 || pageSize > 100)
        {
            return BadRequest("Invalid pagination values.");
        }

        if (fromDate.HasValue && toDate.HasValue && fromDate > toDate)
            return BadRequest("fromDate must be before toDate.");

        var query = from log in _db.AuditLogs.AsNoTracking()
                    join user in _db.Users.AsNoTracking()
                        on log.UserId equals (int?)user.Id into actors
                    from user in actors.DefaultIfEmpty()
                    select new AuditLogResponseDto
                    {
                        Id = log.Id,
                        UserId = log.UserId,
                        ActorName = user == null ? "System" : user.FullName,
                        ActorEmail = user == null ? null : user.Email,
                        Action = log.Action,
                        EntityType = log.EntityType,
                        EntityId = log.EntityId,
                        Description = log.Description,
                        Timestamp = log.Timestamp
                    };

        if (!string.IsNullOrWhiteSpace(action))
        {
            query = query.Where(a => a.Action.Contains(action));
        }

        if (!string.IsNullOrWhiteSpace(entityType))
            query = query.Where(a => a.EntityType.Contains(entityType));
        if (actorId.HasValue) query = query.Where(a => a.UserId == actorId.Value);
        if (entityId.HasValue) query = query.Where(a => a.EntityId == entityId.Value);
        if (!string.IsNullOrWhiteSpace(category))
        {
            query = category switch
            {
                "Customers" => query.Where(a => a.EntityType.Contains("Customer") || (a.EntityType == "ApplicationUser" && a.Action.Contains("Customer"))),
                "Officers" => query.Where(a => a.EntityType.Contains("Officer") || (a.EntityType == "ApplicationUser" && a.Action.Contains("Officer"))),
                "Products" => query.Where(a => a.EntityType.Contains("Product")),
                "Applications" => query.Where(a => a.EntityType.Contains("Application")),
                "KYC" => query.Where(a => a.EntityType.Contains("Kyc")),
                "Support" => query.Where(a => a.EntityType.Contains("Ticket")),
                "Other" => query.Where(a => !(a.EntityType.Contains("Customer") || a.EntityType.Contains("Officer") || a.EntityType.Contains("Product") || a.EntityType.Contains("Application") || a.EntityType.Contains("Kyc") || a.EntityType.Contains("Ticket") || (a.EntityType == "ApplicationUser" && (a.Action.Contains("Customer") || a.Action.Contains("Officer"))))),
                _ => query
            };
        }
        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(a => (a.ActorName != null && a.ActorName.Contains(search)) ||
                (a.ActorEmail != null && a.ActorEmail.Contains(search)) || a.Action.Contains(search) || a.EntityType.Contains(search) ||
                (a.Description != null && a.Description.Contains(search)));
        if (fromDate.HasValue)
            query = query.Where(a => a.Timestamp >= fromDate.Value);
        if (toDate.HasValue)
            query = query.Where(a => a.Timestamp < toDate.Value.AddDays(1));

        var totalCount = await query.CountAsync();
        var logs = await query
            .OrderByDescending(a => a.Timestamp)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();
        var actorIds = logs.Where(l => l.UserId.HasValue).Select(l => l.UserId!.Value).Distinct().ToArray();
        var roles = await (from userRole in _db.UserRoles join role in _db.Roles on userRole.RoleId equals role.Id
                           where actorIds.Contains(userRole.UserId) select new { userRole.UserId, role.Name }).ToListAsync();
        foreach (var log in logs)
        {
            log.ActorRoles = string.Join(", ", roles.Where(r => r.UserId == log.UserId).Select(r => r.Name));
            log.Category = GetCategory(log.EntityType, log.Action);
        }
        return Ok(new { items = logs, totalCount });
    }

    private static string GetCategory(string entityType, string action) => (entityType, action) switch
    {
        var (_, act) when act.Contains("Officer", StringComparison.OrdinalIgnoreCase) => "Officers",
        var (_, act) when act.Contains("Customer", StringComparison.OrdinalIgnoreCase) => "Customers",
        var (entity, _) when entity.Contains("Customer", StringComparison.OrdinalIgnoreCase) => "Customers",
        var (entity, _) when entity.Contains("Officer", StringComparison.OrdinalIgnoreCase) => "Officers",
        var (entity, _) when entity.Contains("Product", StringComparison.OrdinalIgnoreCase) => "Products",
        var (entity, _) when entity.Contains("Application", StringComparison.OrdinalIgnoreCase) => "Applications",
        var (entity, _) when entity.Contains("Kyc", StringComparison.OrdinalIgnoreCase) => "KYC",
        var (entity, _) when entity.Contains("Ticket", StringComparison.OrdinalIgnoreCase) => "Support",
        _ => "Other"
    };
}
