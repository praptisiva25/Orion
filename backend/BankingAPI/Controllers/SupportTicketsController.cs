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
[Route("api/support-tickets")]
[Authorize(Roles = "Customer")]
public class SupportTicketsController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly AuditLogService _auditLog;
    private readonly NotificationService _notifications;

    public SupportTicketsController(
        ApplicationDbContext db,
        AuditLogService auditLog,
        NotificationService notifications)
    {
        _db = db;
        _auditLog = auditLog;
        _notifications = notifications;
    }

    private int GetUserId()
    {
        return int.Parse(
            User.FindFirstValue(ClaimTypes.NameIdentifier)!
        );
    }

    // Create a support ticket
    [HttpPost]
    public async Task<IActionResult> CreateTicket(
        CreateSupportTicketRequestDto request,
        CancellationToken cancellationToken)
    {
        var userId = GetUserId();

        var allowedPriorities = new[]
        {
            "Low", "Normal", "High", "Urgent"
        };

        if (!allowedPriorities.Contains(request.Priority))
        {
            return BadRequest(new
            {
                message = "Invalid ticket priority."
            });
        }

        var ticket = new SupportTicket
        {
            UserId = userId,
            Subject = request.Subject.Trim(),
            Description = request.Description.Trim(),
            Priority = request.Priority,
            Status = "Open",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        await using (var transaction = await _db.Database.BeginTransactionAsync(cancellationToken))
        {
            _db.SupportTickets.Add(ticket);
            await _db.SaveChangesAsync(cancellationToken);
            _db.TicketSentimentJobs.Add(new TicketSentimentJob
            {
                SupportTicketId = ticket.Id,
                EventSequence = 0,
                AnalysisStage = "Initial",
                Status = "Pending"
            });
            await _db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }

        await _auditLog.LogAsync(
            userId,
            "Support Ticket Created",
            "SupportTicket",
            ticket.Id,
            "Customer created a support ticket."
        );

        return Ok(new
        {
            message = "Support ticket created successfully.",
            ticket = new SupportTicketResponseDto
            {
                Id = ticket.Id,
                UserId = ticket.UserId,
                AssignedOfficerId = ticket.AssignedOfficerId,
                Subject = ticket.Subject,
                Description = ticket.Description,
                Status = ticket.Status,
                Priority = ticket.Priority,
                CreatedAt = ticket.CreatedAt,
                UpdatedAt = ticket.UpdatedAt
            }
        });
    }

    // Get the customer's tickets
    [HttpGet("my")]
    public async Task<IActionResult> GetMyTickets()
    {
        var userId = GetUserId();

        var tickets = await _db.SupportTickets
            .AsNoTracking()
            .Where(t => t.UserId == userId)
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

    // Get one of the customer's tickets
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetTicket(int id)
    {
        var userId = GetUserId();

        var ticket = await _db.SupportTickets
            .AsNoTracking()
            .Where(t => t.Id == id && t.UserId == userId)
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
            return NotFound(new { message = "Ticket not found." });

        return Ok(ticket);
    }

    // Get messages for the customer's ticket
    [HttpGet("{id:int}/messages")]
    public async Task<IActionResult> GetMessages(int id)
    {
        var userId = GetUserId();

        var ownsTicket = await _db.SupportTickets
            .AnyAsync(t => t.Id == id && t.UserId == userId);

        if (!ownsTicket)
            return NotFound(new { message = "Ticket not found." });

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

    // Customer sends a message
    [HttpPost("{id:int}/messages")]
    public async Task<IActionResult> SendMessage(
        int id,
        CreateTicketMessageRequestDto request,
        CancellationToken cancellationToken)
    {
        var userId = GetUserId();

        await using var transaction = await _db.Database.BeginTransactionAsync(cancellationToken);
        var ticket = await _db.SupportTickets
            .FromSqlInterpolated($"SELECT * FROM \"SupportTickets\" WHERE \"Id\" = {id} FOR UPDATE")
            .FirstOrDefaultAsync(cancellationToken);

        if (ticket == null || ticket.UserId != userId)
        {
            await transaction.RollbackAsync(cancellationToken);
            return NotFound(new { message = "Ticket not found." });
        }

        if (ticket.Status == "Closed")
        {
            await transaction.RollbackAsync(cancellationToken);
            return BadRequest(new
            {
                message = "This ticket is closed and cannot receive new messages."
            });
        }

        var messageText = request.Message.Trim();

        if (string.IsNullOrWhiteSpace(messageText))
        {
            await transaction.RollbackAsync(cancellationToken);
            return BadRequest(new { message = "Message cannot be empty." });
        }

        var message = new TicketMessage
        {
            SupportTicketId = ticket.Id,
            SenderUserId = userId,
            SenderRole = "Customer",
            Message = messageText,
            SentAt = DateTime.UtcNow
        };

        _db.TicketMessages.Add(message);

        ticket.UpdatedAt = DateTime.UtcNow;
        ticket.SentimentEventSequence++;

        await _db.SaveChangesAsync(cancellationToken);
        _db.TicketSentimentJobs.Add(new TicketSentimentJob
        {
            SupportTicketId = ticket.Id,
            TicketMessageId = message.Id,
            EventSequence = ticket.SentimentEventSequence,
            AnalysisStage = "CustomerFollowUp",
            Status = "Pending"
        });
        await _db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        if (ticket.AssignedOfficerId.HasValue)
        {
            await _notifications.CreateAsync(
                ticket.AssignedOfficerId.Value,
                "New Customer Message",
                $"A customer sent a message on ticket #{ticket.Id}."
            );
        }

        await _auditLog.LogAsync(
            userId,
            "Support Ticket Message Sent",
            "SupportTicket",
            ticket.Id,
            "Customer sent a message."
        );

        return Ok(new
        {
            message = "Message sent successfully.",
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
