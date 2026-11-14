using System.Net;
using System.Text;
using BankingAPI.DTOs.AI;
using BankingAPI.Services.AI;
using Microsoft.Extensions.Options;
using Xunit;

namespace BankingAPI.Tests;

public sealed class NextBestActionClientTests
{
    private const string InternalKey = "synthetic-internal-test-key-123456789";

    [Fact]
    public async Task GenerateNextBestActionAsync_UsesProtectedContractAndValidatesResponse()
    {
        var handler = new StubHandler(async request =>
        {
            Assert.Equal(HttpMethod.Post, request.Method);
            Assert.Equal("v1/nba/recommendations", request.RequestUri!.PathAndQuery.TrimStart('/'));
            Assert.Equal("Bearer", request.Headers.Authorization!.Scheme);
            Assert.Equal(InternalKey, request.Headers.Authorization.Parameter);
            var body = await request.Content!.ReadAsStringAsync();
            Assert.Contains("\"sender_role\":\"customer\"", body);
            Assert.DoesNotContain("officer-only-context-marker", body);
            return JsonResponse(SuccessResponse);
        });
        var service = CreateClient(handler);

        var result = await service.GenerateNextBestActionAsync(Request(), CancellationToken.None);

        Assert.True(result.AdvisoryOnly);
        Assert.Equal("general_guidance", result.RecommendationMode);
        Assert.False(result.EvidenceAvailable);
        Assert.StartsWith("General AI guidance", result.Disclaimer);
        var recommendation = Assert.Single(result.Recommendations);
        Assert.Equal("Review the ATM report", recommendation.Title);
        Assert.True(recommendation.RequiresOfficerReview);
        Assert.Empty(recommendation.EvidenceReferences);
    }

    [Fact]
    public async Task GenerateNextBestActionAsync_RejectsResponseThatCouldBypassOfficerReview()
    {
        const string unsafeResponse = """
            {"recommendation_mode":"general_guidance","evidence_available":false,"disclaimer":"General AI guidance — These suggestions are generated using general AI knowledge. They have not been verified against Orion's internal policies or approved banking procedures.","recommendations":[{"title":"Review report","rationale":"The customer reported an issue that needs review.","evidence_supported_guidance":[],"additional_suggestions":[],"suggested_actions":["Review details."],"missing_information":[],"escalation_conditions":[],"priority":null,"evidence_references":[],"requires_officer_review":false}],"advisory_only":true}
            """;
        var service = CreateClient(new StubHandler(_ => Task.FromResult(JsonResponse(unsafeResponse))));

        var error = await Assert.ThrowsAsync<AiTicketServiceException>(() =>
            service.GenerateNextBestActionAsync(Request(), CancellationToken.None));

        Assert.Equal(502, error.StatusCode);
        Assert.DoesNotContain("Refund the transaction", error.Message);
    }

    [Fact]
    public async Task GenerateNextBestActionAsync_MapsUpstreamFailureToSafeError()
    {
        var service = CreateClient(new StubHandler(_ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.BadGateway))));

        var error = await Assert.ThrowsAsync<AiTicketServiceException>(() =>
            service.GenerateNextBestActionAsync(Request(), CancellationToken.None));

        Assert.Equal(502, error.StatusCode);
        Assert.DoesNotContain("customer-sensitive-marker", error.Message);
    }

    [Fact]
    public async Task GenerateNextBestActionAsync_MapsServiceUnavailableToRetryableMessage()
    {
        var service = CreateClient(new StubHandler(_ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable))));

        var error = await Assert.ThrowsAsync<AiTicketServiceException>(() =>
            service.GenerateNextBestActionAsync(Request(), CancellationToken.None));

        Assert.Equal(503, error.StatusCode);
        Assert.Contains("Please retry", error.Message);
    }

    private static AiTicketService CreateClient(HttpMessageHandler handler)
    {
        var http = new HttpClient(handler) { BaseAddress = new Uri("http://127.0.0.1:8001/") };
        var options = Options.Create(new AiServiceOptions
        {
            BaseUrl = "http://127.0.0.1:8001/",
            InternalServiceKey = InternalKey,
            TimeoutSeconds = 30
        });
        return new AiTicketService(http, options);
    }

    private static AiNextBestActionRequestDto Request() => new()
    {
        TicketId = 12,
        Subject = "ATM cash report",
        Description = "Customer says ATM cash was not dispensed.",
        Status = "Open",
        Priority = "Normal",
        Messages = [new AiCustomerMessageDto { SenderRole = "customer", Message = "Synthetic customer message." }],
        LatestSentiment = new AiLatestSentimentDto { Label = "neutral", Confidence = 0.75 }
    };

    private const string SuccessResponse = """
        {"recommendation_mode":"general_guidance","evidence_available":false,"disclaimer":"General AI guidance — These suggestions are generated using general AI knowledge. They have not been verified against Orion's internal policies or approved banking procedures.","recommendations":[{"title":"Review the ATM report","rationale":"The customer reports an ATM issue that needs Officer review.","evidence_supported_guidance":[],"additional_suggestions":[],"suggested_actions":["Review the reported transaction details through the authorized support process."],"missing_information":["Approximate transaction time"],"escalation_conditions":[],"priority":"normal","evidence_references":[],"requires_officer_review":true}],"advisory_only":true}
        """;

    private static HttpResponseMessage JsonResponse(string json) => new(HttpStatusCode.OK)
    {
        Content = new StringContent(json, Encoding.UTF8, "application/json")
    };

    private sealed class StubHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => send(request);
    }
}
