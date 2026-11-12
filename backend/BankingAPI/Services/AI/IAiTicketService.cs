using BankingAPI.DTOs.AI;

namespace BankingAPI.Services.AI;

public interface IAiTicketService
{
    Task<string> GenerateSummaryAsync(
        AiTicketContextRequestDto ticket,
        CancellationToken cancellationToken);

    Task<string> GenerateSuggestedResponseAsync(
        AiTicketContextRequestDto ticket,
        CancellationToken cancellationToken);
}

public sealed class AiTicketServiceException(int statusCode, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}
