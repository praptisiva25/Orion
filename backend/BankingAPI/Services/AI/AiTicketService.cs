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

    public AiTicketService(HttpClient httpClient, IOptions<AiServiceOptions> options)
    {
        _httpClient = httpClient;
        _options = options.Value;
    }

    public Task<string> GenerateSummaryAsync(
        AiTicketContextRequestDto ticket,
        CancellationToken cancellationToken) =>
        GenerateAsync("v1/tickets/summary", ticket, cancellationToken);

    public Task<string> GenerateSuggestedResponseAsync(
        AiTicketContextRequestDto ticket,
        CancellationToken cancellationToken) =>
        GenerateAsync("v1/tickets/suggested-response", ticket, cancellationToken);

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
}
