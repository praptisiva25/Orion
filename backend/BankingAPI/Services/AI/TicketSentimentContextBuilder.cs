using BankingAPI.Data;
using BankingAPI.Models;
using Microsoft.EntityFrameworkCore;

namespace BankingAPI.Services.AI;

public static class TicketSentimentContextBuilder
{
    private const int MaxInputCharacters = 10_000;

    public static async Task<string> BuildAnalysisTextAsync(
        ApplicationDbContext db,
        SupportTicket ticket,
        TicketSentimentJob job,
        CancellationToken cancellationToken)
    {
        var description = $"Ticket description:\n{ticket.Description}";
        if (job.TicketMessageId is not int eventMessageId)
            return description;

        // Identity IDs are strictly increasing. Customer sends lock the ticket before inserting,
        // so this message ID is a stable upper boundary even for legacy messages with no job row.
        var customerMessages = await db.TicketMessages.AsNoTracking()
            .Where(message => message.SupportTicketId == job.SupportTicketId &&
                              message.SenderRole == "Customer" && message.Id <= eventMessageId)
            .OrderBy(message => message.SentAt)
            .ThenBy(message => message.Id)
            .Select(message => message.Message)
            .ToListAsync(cancellationToken);

        var prefix = description + "\nCustomer follow-up messages:\n";
        var remaining = Math.Max(0, MaxInputCharacters - prefix.Length);
        var included = new List<string>();
        foreach (var message in customerMessages.AsEnumerable().Reverse())
        {
            if (remaining <= 0)
                break;

            var separatorLength = included.Count == 0 ? 0 : 1;
            var available = Math.Max(0, remaining - separatorLength);
            if (available == 0)
                break;

            var clipped = message.Length > available ? message[^available..] : message;
            included.Insert(0, clipped);
            remaining -= clipped.Length + separatorLength;
        }

        if (included.Count == 0)
            return description;

        // FastAPI currently accepts at most 10,000 characters. Preserve the initial description
        // and the most recent customer messages if the full thread exceeds that contract.
        return prefix + string.Join("\n", included);
    }
}
