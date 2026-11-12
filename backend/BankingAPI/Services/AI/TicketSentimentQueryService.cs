using BankingAPI.Data;
using BankingAPI.Models;
using Microsoft.EntityFrameworkCore;

namespace BankingAPI.Services.AI;

public sealed class TicketSentimentQueryService(ApplicationDbContext db) : ITicketSentimentQueryService
{
    public IQueryable<TicketSentiment> GetLatestSuccessfulPerTicketQuery()
    {
        var latestSequences = db.TicketSentiments.AsNoTracking()
            .GroupBy(sentiment => sentiment.SupportTicketId)
            .Select(group => new
            {
                SupportTicketId = group.Key,
                EventSequence = group.Max(sentiment => sentiment.EventSequence)
            });

        return from sentiment in db.TicketSentiments.AsNoTracking()
               join latest in latestSequences
                   on new { sentiment.SupportTicketId, sentiment.EventSequence }
                   equals new { latest.SupportTicketId, latest.EventSequence }
               select sentiment;
    }

    public Task<TicketSentiment?> GetLatestSuccessfulAsync(int ticketId, CancellationToken cancellationToken) =>
        db.TicketSentiments.AsNoTracking()
            .Where(sentiment => sentiment.SupportTicketId == ticketId)
            .OrderByDescending(sentiment => sentiment.EventSequence)
            .ThenByDescending(sentiment => sentiment.Id)
            .FirstOrDefaultAsync(cancellationToken);
}
