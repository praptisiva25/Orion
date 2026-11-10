using System.Security.Claims;
using BankingAPI.Data;
using BankingAPI.DTOs.Admin;
using BankingAPI.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BankingAPI.Controllers;

[ApiController]
[Route("api/admin/support-tickets")]
[Authorize(Roles = "Admin")]
public class AdminSupportTicketsController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly AuditLogService _auditLog;

    public AdminSupportTicketsController(ApplicationDbContext db, AuditLogService auditLog)
    {
        _db = db;
        _auditLog = auditLog;
    }

    [HttpGet]
    public async Task<ActionResult<List<AdminSupportTicketDto>>> GetTickets(
        [FromQuery] string? search, [FromQuery] string? status,
        [FromQuery] string? priority, [FromQuery] DateTime? fromDate,
        [FromQuery] DateTime? toDate)
    {
        if (fromDate.HasValue && toDate.HasValue && fromDate > toDate)
            return BadRequest(new { message = "fromDate must be before toDate." });

        var query = from ticket in _db.SupportTickets.AsNoTracking()
                    join customer in _db.Users.AsNoTracking() on ticket.UserId equals customer.Id
                    join officer in _db.Users.AsNoTracking()
                        on ticket.AssignedOfficerId equals (int?)officer.Id into assignedUsers
                    from officer in assignedUsers.DefaultIfEmpty()
                    select new AdminSupportTicketDto
                    {
                        Id = ticket.Id,
                        UserId = ticket.UserId,
                        CustomerName = customer.FullName,
                        CustomerEmail = customer.Email ?? string.Empty,
                        AssignedOfficerId = ticket.AssignedOfficerId,
                        AssignedOfficerName = officer == null ? null : officer.FullName,
                        Subject = ticket.Subject,
                        Description = ticket.Description,
                        Status = ticket.Status,
                        Priority = ticket.Priority,
                        CreatedAt = ticket.CreatedAt,
                        UpdatedAt = ticket.UpdatedAt
                    };

        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(t => t.Subject.Contains(search) || t.CustomerName.Contains(search) || t.CustomerEmail.Contains(search));
        if (!string.IsNullOrWhiteSpace(status))
            query = query.Where(t => t.Status == status);
        if (!string.IsNullOrWhiteSpace(priority))
            query = query.Where(t => t.Priority == priority);
        if (fromDate.HasValue)
            query = query.Where(t => t.CreatedAt >= fromDate.Value);
        if (toDate.HasValue)
            query = query.Where(t => t.CreatedAt < toDate.Value.AddDays(1));

        return Ok(await query.OrderByDescending(t => t.UpdatedAt).ToListAsync());
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetTicket(int id)
    {
        var ticket = await (from item in _db.SupportTickets.AsNoTracking()
                            join customer in _db.Users.AsNoTracking() on item.UserId equals customer.Id
                            join officer in _db.Users.AsNoTracking()
                                on item.AssignedOfficerId equals (int?)officer.Id into assignedUsers
                            from officer in assignedUsers.DefaultIfEmpty()
                            where item.Id == id
                            select new AdminSupportTicketDto
                            {
                                Id = item.Id,
                                UserId = item.UserId,
                                CustomerName = customer.FullName,
                                CustomerEmail = customer.Email ?? string.Empty,
                                AssignedOfficerId = item.AssignedOfficerId,
                                AssignedOfficerName = officer == null ? null : officer.FullName,
                                Subject = item.Subject,
                                Description = item.Description,
                                Status = item.Status,
                                Priority = item.Priority,
                                CreatedAt = item.CreatedAt,
                                UpdatedAt = item.UpdatedAt
                            }).FirstOrDefaultAsync();
        if (ticket == null) return NotFound(new { message = "Ticket not found." });

        var messages = await (from message in _db.TicketMessages.AsNoTracking()
                              join sender in _db.Users.AsNoTracking() on message.SenderUserId equals sender.Id
                              where message.SupportTicketId == id
                              orderby message.SentAt
                              select new
                              {
                                  message.Id,
                                  message.SupportTicketId,
                                  message.SenderUserId,
                                  SenderName = sender.FullName,
                                  message.SenderRole,
                                  message.Message,
                                  message.SentAt
                              }).ToListAsync();
        return Ok(new { ticket, messages });
    }

    [HttpPut("{id:int}/assignment")]
    public async Task<IActionResult> AssignTicket(int id, AssignAdminTicketRequestDto request)
    {
        var ticket = await _db.SupportTickets.FirstOrDefaultAsync(t => t.Id == id);
        if (ticket == null) return NotFound(new { message = "Ticket not found." });

        string? newOfficerName = null;
        if (request.OfficerId.HasValue)
        {
            var officer = await _db.Users.FirstOrDefaultAsync(u => u.Id == request.OfficerId.Value);
            if (officer == null || !officer.IsActive ||
                !await _db.UserRoles.Join(_db.Roles, ur => ur.RoleId, role => role.Id,
                    (ur, role) => new { ur.UserId, role.Name })
                    .AnyAsync(item => item.UserId == officer.Id && item.Name == "Officer"))
                return BadRequest(new { message = "Select an active Officer account." });
            newOfficerName = officer.FullName;
        }

        var previousOfficerId = ticket.AssignedOfficerId;
        if (previousOfficerId == request.OfficerId)
            return BadRequest(new { message = "Ticket is already assigned to that Officer." });

        ticket.AssignedOfficerId = request.OfficerId;
        ticket.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var adminId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        await _auditLog.LogAsync(adminId, request.OfficerId.HasValue ? "Support Ticket Assigned" : "Support Ticket Unassigned",
            "SupportTicket", id,
            $"Admin changed ticket assignment from Officer #{previousOfficerId?.ToString() ?? "none"} to {newOfficerName ?? "unassigned"}.");
        return Ok(new { message = "Ticket assignment updated.", ticketId = id, assignedOfficerId = request.OfficerId, assignedOfficerName = newOfficerName });
    }
}
