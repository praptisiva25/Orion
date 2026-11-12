using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using BankingAPI.DTOs.AI;
using Microsoft.Extensions.Options;

namespace BankingAPI.Services.AI;

public sealed class SentimentAnalysisClient(HttpClient httpClient, IOptions<AiServiceOptions> options)
    : ISentimentAnalysisClient
{
    private readonly AiServiceOptions _options = options.Value;

    public async Task<SentimentAnalysisResponseDto> AnalyzeAsync(
        string text,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(text) || text.Length > 10_000)
            throw new SentimentServiceException(SentimentFailureKind.Permanent, "Invalid sentiment input.");

        if (!IsConfigured())
            throw new SentimentServiceException(SentimentFailureKind.Permanent, "Sentiment service is not configured.");

        using var request = new HttpRequestMessage(HttpMethod.Post, "v1/sentiment/analyze")
        {
            Content = JsonContent.Create(new SentimentAnalysisRequestDto { Text = text })
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.InternalServiceKey);

        try
        {
            using var response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            if (response.StatusCode is HttpStatusCode.RequestTimeout or HttpStatusCode.TooManyRequests ||
                (int)response.StatusCode >= 500)
                throw new SentimentServiceException(SentimentFailureKind.Transient, "Sentiment service is temporarily unavailable.");

            if (!response.IsSuccessStatusCode)
                throw new SentimentServiceException(SentimentFailureKind.Permanent, "Sentiment service rejected the request.");

            var result = await response.Content.ReadFromJsonAsync<SentimentAnalysisResponseDto>(cancellationToken: cancellationToken);
            if (result is null || result.Label is not ("negative" or "neutral" or "positive") ||
                !double.IsFinite(result.Confidence) || result.Confidence is < 0 or > 1 ||
                string.IsNullOrWhiteSpace(result.ModelName))
                throw new SentimentServiceException(SentimentFailureKind.Permanent, "Sentiment service returned an invalid response.");

            return result;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new SentimentServiceException(SentimentFailureKind.Transient, "Sentiment service timed out.");
        }
        catch (HttpRequestException)
        {
            throw new SentimentServiceException(SentimentFailureKind.Transient, "Sentiment service is unavailable.");
        }
        catch (JsonException)
        {
            throw new SentimentServiceException(SentimentFailureKind.Permanent, "Sentiment service returned an invalid response.");
        }
    }

    private bool IsConfigured() =>
        Uri.TryCreate(_options.BaseUrl, UriKind.Absolute, out var uri) &&
        uri.Scheme is "http" or "https" && string.IsNullOrEmpty(uri.UserInfo) &&
        _options.InternalServiceKey.Length >= 32;
}

public enum SentimentFailureKind { Transient, Permanent }

public sealed class SentimentServiceException(SentimentFailureKind kind, string message) : Exception(message)
{
    public SentimentFailureKind Kind { get; } = kind;
}
