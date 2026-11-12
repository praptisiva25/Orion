using BankingAPI.DTOs.AI;

namespace BankingAPI.Services.AI;

public interface ISentimentAnalysisClient
{
    Task<SentimentAnalysisResponseDto> AnalyzeAsync(string text, CancellationToken cancellationToken);
}
