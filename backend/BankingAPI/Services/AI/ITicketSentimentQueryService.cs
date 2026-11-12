using BankingAPI.Models;

namespace BankingAPI.Services.AI;

public interface ITicketSentimentQueryService
{
    Task<TicketSentiment?> GetLatestSuccessfulAsync(int ticketId, CancellationToken cancellationToken);
}
