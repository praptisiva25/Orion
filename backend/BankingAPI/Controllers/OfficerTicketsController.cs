using BankingAPI.Data;
using BankingAPI.DTOs.SupportTickets;
using BankingAPI.Models;
using BankingAPI.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace BankingAPI.Controllers;

[ApiController]
[Route("api/officer/tickets")]
[Authorize(Roles = "Officer")]
public class OfficerTicketsController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly AuditLogService _auditLog;
    private readonly NotificationService _notifications;

    public OfficerTicketsController(
        ApplicationDbContext db,
        AuditLogService auditLog,
        NotificationService notifications)
    {
        _db = db;
        _auditLog = auditLog;
        _notifications = notifications;
    }

    private int GetOfficerId()
    {
        return int.Parse(
            User.FindFirstValue(ClaimTypes.NameIdentifier)!
        );
    }

    // Get tickets assigned to this officer
    [HttpGet]
    public async Task<IActionResult> GetAssignedTickets()
    {
        var officerId = GetOfficerId();

        var tickets = await _db.SupportTickets
            .AsNoTracking()
            .Where(t => t.AssignedOfficerId == officerId && t.Status != "Resolved" && t.Status != "Closed")
            .OrderByDescending(t => t.UpdatedAt)
            .Select(t => new SupportTicketResponseDto
            {
                Id = t.Id,
                UserId = t.UserId,
                AssignedOfficerId = t.AssignedOfficerId,
                Subject = t.Subject,
                Description = t.Description,
                Status = t.Status,
                Priority = t.Priority,
                CreatedAt = t.CreatedAt,
                UpdatedAt = t.UpdatedAt
            })
            .ToListAsync();

        return Ok(tickets);
    }

    [HttpGet("history")]
    public async Task<IActionResult> GetTicketHistory([FromQuery] string? status, [FromQuery] string? priority,
        [FromQuery] DateTime? fromDate, [FromQuery] DateTime? toDate)
    {
        var officerId = GetOfficerId();
        var query = _db.SupportTickets.AsNoTracking().Where(t => t.AssignedOfficerId == officerId && (t.Status == "Resolved" || t.Status == "Closed"));
        if (!string.IsNullOrWhiteSpace(status) && status != "All")
        {
            if (status is not ("Resolved" or "Closed")) return BadRequest("Invalid history status.");
            query = query.Where(t => t.Status == status);
        }
        if (!string.IsNullOrWhiteSpace(priority)) query = query.Where(t => t.Priority == priority);
        if (fromDate.HasValue) query = query.Where(t => t.CreatedAt >= fromDate.Value);
        if (toDate.HasValue) query = query.Where(t => t.CreatedAt < toDate.Value.Date.AddDays(1));
        return Ok(await query.OrderByDescending(t => t.UpdatedAt).Select(t => new SupportTicketResponseDto
        { Id = t.Id, UserId = t.UserId, AssignedOfficerId = t.AssignedOfficerId, Subject = t.Subject, Description = t.Description,
          Status = t.Status, Priority = t.Priority, CreatedAt = t.CreatedAt, UpdatedAt = t.UpdatedAt }).ToListAsync());
    }

    // Get one assigned ticket
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetTicketById(int id)
    {
        var officerId = GetOfficerId();

        var ticket = await _db.SupportTickets
            .AsNoTracking()
            .Where(t =>
                t.Id == id &&
                t.AssignedOfficerId == officerId)
            .Select(t => new SupportTicketResponseDto
            {
                Id = t.Id,
                UserId = t.UserId,
                AssignedOfficerId = t.AssignedOfficerId,
                Subject = t.Subject,
                Description = t.Description,
                Status = t.Status,
                Priority = t.Priority,
                CreatedAt = t.CreatedAt,
                UpdatedAt = t.UpdatedAt
            })
            .FirstOrDefaultAsync();

        if (ticket == null)
            return NotFound(new { message = "Assigned ticket not found." });

        return Ok(ticket);
    }

    // Update ticket status
    [HttpPut("{id:int}/status")]
    public async Task<IActionResult> UpdateTicketStatus(
        int id,
        UpdateTicketStatusRequestDto request)
    {
        var officerId = GetOfficerId();

        var allowedStatuses = new[]
        {
            "Open", "InProgress", "Resolved", "Closed"
        };

        if (!allowedStatuses.Contains(request.Status))
        {
            return BadRequest(new
            {
                message = "Invalid ticket status."
            });
        }

        var ticket = await _db.SupportTickets
            .FirstOrDefaultAsync(t =>
                t.Id == id &&
                t.AssignedOfficerId == officerId);

        if (ticket == null)
            return NotFound(new { message = "Assigned ticket not found." });

        if (ticket.Status == "Closed")
            return BadRequest(new
            {
                message = "Closed tickets cannot be updated."
            });

        var oldStatus = ticket.Status;

        await using var transaction = await _db.Database.BeginTransactionAsync();
        ticket.Status = request.Status;
        ticket.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        await _notifications.CreateAsync(
            ticket.UserId,
            "Support Ticket Updated",
            $"Your ticket #{ticket.Id} status changed to {ticket.Status}."
        );

        await _auditLog.LogAsync(
            officerId,
            "Support Ticket Status Updated",
            "SupportTicket",
            ticket.Id,
            $"Officer changed ticket status from {oldStatus} to {ticket.Status}."
        );
        await transaction.CommitAsync();

        return Ok(new
        {
            message = "Ticket status updated successfully.",
            ticketId = ticket.Id,
            status = ticket.Status
        });
    }

    // Get messages for an assigned ticket
    [HttpGet("{id:int}/messages")]
    public async Task<IActionResult> GetMessages(int id)
    {
        var officerId = GetOfficerId();

        var ownsAssignment = await _db.SupportTickets
            .AnyAsync(t =>
                t.Id == id &&
                t.AssignedOfficerId == officerId);

        if (!ownsAssignment)
            return NotFound(new { message = "Assigned ticket not found." });

        var messages = await _db.TicketMessages
            .AsNoTracking()
            .Where(m => m.SupportTicketId == id)
            .OrderBy(m => m.SentAt)
            .Select(m => new TicketMessageResponseDto
            {
                Id = m.Id,
                SupportTicketId = m.SupportTicketId,
                SenderUserId = m.SenderUserId,
                SenderRole = m.SenderRole,
                Message = m.Message,
                SentAt = m.SentAt
            })
            .ToListAsync();

        return Ok(messages);
    }

    // Officer replies to customer
    [HttpPost("{id:int}/messages")]
    public async Task<IActionResult> SendMessage(
        int id,
        CreateTicketMessageRequestDto request)
    {
        var officerId = GetOfficerId();

        var ticket = await _db.SupportTickets
            .FirstOrDefaultAsync(t =>
                t.Id == id &&
                t.AssignedOfficerId == officerId);

        if (ticket == null)
            return NotFound(new { message = "Assigned ticket not found." });

        if (ticket.Status == "Closed")
            return BadRequest(new
            {
                message = "This ticket is closed and cannot receive new messages."
            });

        var messageText = request.Message.Trim();

        if (string.IsNullOrWhiteSpace(messageText))
            return BadRequest(new { message = "Message cannot be empty." });

        var message = new TicketMessage
        {
            SupportTicketId = ticket.Id,
            SenderUserId = officerId,
            SenderRole = "Officer",
            Message = messageText,
            SentAt = DateTime.UtcNow
        };

        await using var transaction = await _db.Database.BeginTransactionAsync();
        _db.TicketMessages.Add(message);

        ticket.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        await _notifications.CreateAsync(
            ticket.UserId,
            "New Support Reply",
            $"An officer replied to your support ticket #{ticket.Id}."
        );

        await _auditLog.LogAsync(
            officerId,
            "Support Ticket Message Sent",
            "SupportTicket",
            ticket.Id,
            "Officer sent a reply to the customer."
        );
        await transaction.CommitAsync();

        return Ok(new
        {
            message = "Reply sent successfully.",
            data = new TicketMessageResponseDto
            {
                Id = message.Id,
                SupportTicketId = message.SupportTicketId,
                SenderUserId = message.SenderUserId,
                SenderRole = message.SenderRole,
                Message = message.Message,
                SentAt = message.SentAt
            }
        });
    }
}
