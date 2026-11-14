using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using BankingAPI.DTOs.AI;
using Microsoft.Extensions.Options;

namespace BankingAPI.Services.AI;

public sealed class AiTicketService : IAiTicketService
{
    private readonly HttpClient _httpClient;
    private readonly AiServiceOptions _options;
    private readonly ILogger<AiTicketService>? _logger;

    public AiTicketService(
        HttpClient httpClient,
        IOptions<AiServiceOptions> options,
        ILogger<AiTicketService>? logger = null)
    {
        _httpClient = httpClient;
        _options = options.Value;
        _logger = logger;
    }

    public Task<string> GenerateSummaryAsync(
        AiTicketContextRequestDto ticket,
        CancellationToken cancellationToken) =>
        GenerateAsync("v1/tickets/summary", ticket, cancellationToken);

    public Task<string> GenerateSuggestedResponseAsync(
        AiTicketContextRequestDto ticket,
        CancellationToken cancellationToken) =>
        GenerateAsync("v1/tickets/suggested-response", ticket, cancellationToken);

    public async Task<AiNextBestActionResponseDto> GenerateNextBestActionAsync(
        AiNextBestActionRequestDto ticket,
        CancellationToken cancellationToken)
    {
        ValidateConfiguration();
        using var request = new HttpRequestMessage(HttpMethod.Post, "v1/nba/recommendations")
        {
            Content = JsonContent.Create(ticket)
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.InternalServiceKey);

        try
        {
            using var response = await _httpClient.SendAsync(
                request,
                HttpCompletionOption.ResponseHeadersRead,
                cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger?.LogWarning(
                    "NBA FastAPI call failed; stage=fastapi_http status_code={StatusCode}",
                    (int)response.StatusCode);
            }
            if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
                throw new AiTicketServiceException(502, "AI service authentication failed.");
            if (response.StatusCode == HttpStatusCode.TooManyRequests)
                throw new AiTicketServiceException(503, "AI service is busy. Please try again shortly.");
            if (response.StatusCode == HttpStatusCode.ServiceUnavailable)
                throw new AiTicketServiceException(503, "Next Best Action service is temporarily unavailable. Please retry.");
            if (!response.IsSuccessStatusCode)
                throw new AiTicketServiceException(502, "Next Best Action generation failed.");

            var result = await response.Content.ReadFromJsonAsync<AiNextBestActionResponseDto>(
                cancellationToken: cancellationToken);
            if (!IsValidRecommendationResponse(result))
            {
                _logger?.LogWarning("NBA FastAPI call failed; stage=fastapi_response_validation status_code={StatusCode}", (int)response.StatusCode);
                throw new AiTicketServiceException(502, "AI service returned an invalid recommendation response.");
            }
            return result!;
        }
        catch (AiTicketServiceException)
        {
            throw;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            _logger?.LogWarning("NBA FastAPI call failed; stage=fastapi_timeout");
            throw new AiTicketServiceException(504, "AI service request timed out.");
        }
        catch (HttpRequestException exception)
        {
            _logger?.LogWarning(
                "NBA FastAPI call failed; stage=fastapi_transport status_code={StatusCode}",
                exception.StatusCode is null ? null : (int)exception.StatusCode.Value);
            throw new AiTicketServiceException(503, "AI service is unavailable.");
        }
        catch (JsonException)
        {
            throw new AiTicketServiceException(502, "AI service returned an invalid recommendation response.");
        }
    }

    private async Task<string> GenerateAsync(
        string endpoint,
        AiTicketContextRequestDto ticket,
        CancellationToken cancellationToken)
    {
        ValidateConfiguration();

        using var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
        {
            Content = JsonContent.Create(ticket)
        };
        request.Headers.Authorization = new AuthenticationHeaderValue(
            "Bearer", _options.InternalServiceKey);

        try
        {
            using var response = await _httpClient.SendAsync(
                request,
                HttpCompletionOption.ResponseHeadersRead,
                cancellationToken);
            if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
                throw new AiTicketServiceException(502, "AI service authentication failed.");

            if (response.StatusCode == HttpStatusCode.TooManyRequests)
                throw new AiTicketServiceException(503, "AI service is busy. Please try again shortly.");

            if (!response.IsSuccessStatusCode)
                throw new AiTicketServiceException(502, "AI generation failed.");

            var result = await response.Content.ReadFromJsonAsync<AiGeneratedTextResponseDto>(
                cancellationToken: cancellationToken);

            if (string.IsNullOrWhiteSpace(result?.Result))
                throw new AiTicketServiceException(502, "AI service returned an empty result.");

            return result.Result;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new AiTicketServiceException(504, "AI service request timed out.");
        }
        catch (HttpRequestException)
        {
            throw new AiTicketServiceException(503, "AI service is unavailable.");
        }
        catch (JsonException)
        {
            throw new AiTicketServiceException(502, "AI service returned an invalid response.");
        }
    }

    private void ValidateConfiguration()
    {
        if (!Uri.TryCreate(_options.BaseUrl, UriKind.Absolute, out var baseUri) ||
            (baseUri.Scheme != Uri.UriSchemeHttp && baseUri.Scheme != Uri.UriSchemeHttps) ||
            !string.IsNullOrEmpty(baseUri.UserInfo) ||
            !string.IsNullOrEmpty(baseUri.Query) ||
            !string.IsNullOrEmpty(baseUri.Fragment) ||
            _options.TimeoutSeconds is < 1 or > 180)
        {
            throw new AiTicketServiceException(503, "AI service is not configured correctly.");
        }

        var key = _options.InternalServiceKey;
        if (key.Length < 32 || key.Any(character =>
                !(char.IsAsciiLetterOrDigit(character) || character is '-' or '_')))
        {
            throw new AiTicketServiceException(503, "AI service is not configured correctly.");
        }
    }

    private static bool IsValidRecommendationResponse(AiNextBestActionResponseDto? response)
    {
        const string generalDisclaimer = "General AI guidance \u2014 These suggestions are generated using general AI knowledge. They have not been verified against Orion's internal policies or approved banking procedures.";
        if (response is null || !response.AdvisoryOnly || response.Recommendations is null || response.Recommendations.Count is < 1 or > 5 ||
            response.RecommendationMode is not ("knowledge_backed" or "general_guidance") ||
            (response.RecommendationMode == "knowledge_backed" && (!response.EvidenceAvailable || response.Disclaimer is not null)) ||
            (response.RecommendationMode == "general_guidance" && (response.EvidenceAvailable || response.Disclaimer != generalDisclaimer)))
        {
            return false;
        }

        return response.Recommendations.All(recommendation => recommendation is not null &&
            !string.IsNullOrWhiteSpace(recommendation.Title) &&
            !string.IsNullOrWhiteSpace(recommendation.Rationale) &&
            recommendation.RequiresOfficerReview &&
            (recommendation.Priority is null or "low" or "normal" or "high" or "urgent") &&
            recommendation.EvidenceSupportedGuidance is not null &&
            recommendation.AdditionalSuggestions is not null &&
            (response.RecommendationMode != "knowledge_backed" || recommendation.EvidenceSupportedGuidance.Count > 0) &&
            (response.RecommendationMode != "general_guidance" || recommendation.EvidenceSupportedGuidance.Count == 0) &&
            recommendation.SuggestedActions is { Count: > 0 } &&
            recommendation.SuggestedActions.All(action => !string.IsNullOrWhiteSpace(action)) &&
            recommendation.MissingInformation is not null &&
            recommendation.EscalationConditions is not null &&
            recommendation.EvidenceReferences is not null &&
            (response.RecommendationMode == "knowledge_backed"
                ? recommendation.EvidenceReferences.Count > 0
                : recommendation.EvidenceReferences.Count == 0) &&
            recommendation.EvidenceReferences.All(evidence => evidence is not null &&
                !string.IsNullOrWhiteSpace(evidence.EvidenceId) &&
                !string.IsNullOrWhiteSpace(evidence.DocumentId) &&
                !string.IsNullOrWhiteSpace(evidence.Title) &&
                evidence.SourceType is "official_public" or "illustrative_internal" &&
                !string.IsNullOrWhiteSpace(evidence.SourceLabel) &&
                (evidence.SourceType != "illustrative_internal" || evidence.SourceLabel == "Illustrative Orion Demo Guidance") &&
                !string.IsNullOrWhiteSpace(evidence.Excerpt)));
    }
}
