using System.Text.Json.Serialization;

namespace BankingAPI.DTOs.AI;

public sealed class SentimentAnalysisRequestDto
{
    [JsonPropertyName("text")]
    public string Text { get; init; } = string.Empty;
}

public sealed class SentimentAnalysisResponseDto
{
    [JsonPropertyName("label")]
    public string Label { get; init; } = string.Empty;

    [JsonPropertyName("confidence")]
    public double Confidence { get; init; }

    [JsonPropertyName("model_name")]
    public string ModelName { get; init; } = string.Empty;

    [JsonPropertyName("model_version")]
    public string? ModelVersion { get; init; }
}
