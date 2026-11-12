using BankingAPI.Data;
using BankingAPI.Models;
using Microsoft.EntityFrameworkCore;

namespace BankingAPI.Services.AI;

public sealed class TicketSentimentQueryService(ApplicationDbContext db) : ITicketSentimentQueryService
{
    public Task<TicketSentiment?> GetLatestSuccessfulAsync(int ticketId, CancellationToken cancellationToken) =>
        db.TicketSentiments.AsNoTracking()
            .Where(sentiment => sentiment.SupportTicketId == ticketId)
            .OrderByDescending(sentiment => sentiment.EventSequence)
            .ThenByDescending(sentiment => sentiment.Id)
            .FirstOrDefaultAsync(cancellationToken);
}
