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
        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(a => (a.ActorName != null && a.ActorName.Contains(search)) ||
                a.Action.Contains(search) || a.EntityType.Contains(search) ||
                (a.Description != null && a.Description.Contains(search)));
        if (fromDate.HasValue)
            query = query.Where(a => a.Timestamp >= fromDate.Value);
        if (toDate.HasValue)
            query = query.Where(a => a.Timestamp < toDate.Value.AddDays(1));

        var logs = await query
            .OrderByDescending(a => a.Timestamp)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(logs);
    }
}
