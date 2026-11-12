using System.Net;
using System.Text;
using BankingAPI.Services.AI;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Npgsql;
using Xunit;

namespace BankingAPI.Tests;

public sealed class SentimentAnalysisClientTests
{
    private const string InternalKey = "synthetic-internal-test-key-123456789";

    [Fact]
    public async Task AnalyzeAsync_UsesFastApiContractAndValidatesResponse()
    {
        var handler = new StubHandler((request, _) =>
        {
            Assert.Equal(HttpMethod.Post, request.Method);
            Assert.Equal("v1/sentiment/analyze", request.RequestUri!.PathAndQuery.TrimStart('/'));
            Assert.Equal("Bearer", request.Headers.Authorization!.Scheme);
            Assert.Equal(InternalKey, request.Headers.Authorization.Parameter);
            return Task.FromResult(JsonResponse("""
                {"label":"positive","confidence":0.91,"model_name":"synthetic-model","model_version":"test"}
                """));
        });
        var client = CreateClient(handler);

        var result = await client.AnalyzeAsync("Synthetic customer text.", CancellationToken.None);

        Assert.Equal("positive", result.Label);
        Assert.Equal(0.91, result.Confidence);
        Assert.Equal("synthetic-model", result.ModelName);
        Assert.Equal("test", result.ModelVersion);
        Assert.Equal("{\"text\":\"Synthetic customer text.\"}", handler.LastBody);
    }

    [Fact]
    public async Task AnalyzeAsync_RejectsInvalidResponseWithoutRetryingIt()
    {
        var client = CreateClient(new StubHandler((_, _) => Task.FromResult(JsonResponse(
            "{\"label\":\"unknown\",\"confidence\":2,\"model_name\":\"x\"}"))));

        var exception = await Assert.ThrowsAsync<SentimentServiceException>(() =>
            client.AnalyzeAsync("Synthetic input", CancellationToken.None));

        Assert.Equal(SentimentFailureKind.Permanent, exception.Kind);
    }

    [Fact]
    public async Task AnalyzeAsync_ClassifiesMalformedJsonAsPermanent()
    {
        var client = CreateClient(new StubHandler((_, _) => Task.FromResult(JsonResponse("not-json"))));
        var exception = await Assert.ThrowsAsync<SentimentServiceException>(() =>
            client.AnalyzeAsync("Synthetic input", CancellationToken.None));
        Assert.Equal(SentimentFailureKind.Permanent, exception.Kind);
    }

    [Fact]
    public async Task AnalyzeAsync_ClassifiesNetworkFailureAsTransient()
    {
        var client = CreateClient(new StubHandler((_, _) =>
            Task.FromException<HttpResponseMessage>(new HttpRequestException("synthetic transport failure"))));
        var exception = await Assert.ThrowsAsync<SentimentServiceException>(() =>
            client.AnalyzeAsync("Synthetic input", CancellationToken.None));
        Assert.Equal(SentimentFailureKind.Transient, exception.Kind);
    }

    [Fact]
    public async Task AnalyzeAsync_ClassifiesRequestTimeoutAsTransient()
    {
        var client = CreateClient(new StubHandler((_, _) =>
            Task.FromException<HttpResponseMessage>(new TaskCanceledException("synthetic timeout"))));
        var exception = await Assert.ThrowsAsync<SentimentServiceException>(() =>
            client.AnalyzeAsync("Synthetic input", CancellationToken.None));
        Assert.Equal(SentimentFailureKind.Transient, exception.Kind);
    }

    [Theory]
    [InlineData(HttpStatusCode.ServiceUnavailable, SentimentFailureKind.Transient)]
    [InlineData(HttpStatusCode.TooManyRequests, SentimentFailureKind.Transient)]
    [InlineData(HttpStatusCode.UnprocessableEntity, SentimentFailureKind.Permanent)]
    [InlineData(HttpStatusCode.Unauthorized, SentimentFailureKind.Permanent)]
    public async Task AnalyzeAsync_ClassifiesUpstreamStatus(HttpStatusCode status, SentimentFailureKind expected)
    {
        var client = CreateClient(new StubHandler((_, _) => Task.FromResult(new HttpResponseMessage(status))));
        var exception = await Assert.ThrowsAsync<SentimentServiceException>(() =>
            client.AnalyzeAsync("Synthetic input", CancellationToken.None));
        Assert.Equal(expected, exception.Kind);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task AnalyzeAsync_RejectsEmptyInput(string? text)
    {
        var client = CreateClient(new StubHandler((_, _) => throw new InvalidOperationException("Should not send.")));
        var exception = await Assert.ThrowsAsync<SentimentServiceException>(() =>
            client.AnalyzeAsync(text!, CancellationToken.None));
        Assert.Equal(SentimentFailureKind.Permanent, exception.Kind);
    }

    [Fact]
    public async Task AnalyzeAsync_RejectsInputBeyondFastApiLimit()
    {
        var client = CreateClient(new StubHandler((_, _) => throw new InvalidOperationException("Should not send.")));
        var exception = await Assert.ThrowsAsync<SentimentServiceException>(() =>
            client.AnalyzeAsync(new string('x', 10_001), CancellationToken.None));
        Assert.Equal(SentimentFailureKind.Permanent, exception.Kind);
    }

    [Theory]
    [InlineData(1, 10)]
    [InlineData(4, 80)]
    [InlineData(30, 1800)]
    public void RetryDelay_IsExponentialAndBounded(int attempt, int expectedSeconds) =>
        Assert.Equal(TimeSpan.FromSeconds(expectedSeconds), TicketSentimentWorker.ComputeRetryDelay(attempt));

    [Fact]
    public void LeaseDuration_ExceedsConfiguredMaximumHttpTimeout()
    {
        Assert.Equal(TimeSpan.FromSeconds(240), TicketSentimentWorker.ComputeLeaseDuration(180));
    }

    [Theory]
    [InlineData("40001", true)]
    [InlineData("40P01", true)]
    [InlineData("23514", false)]
    [InlineData("23505", false)]
    public void PersistenceFailureClassifier_DistinguishesTransientFromIntegrityErrors(
        string sqlState,
        bool expectedTransient)
    {
        var postgres = new PostgresException("synthetic database failure", "ERROR", "ERROR", sqlState);
        var exception = new DbUpdateException("Synthetic persistence failure.", postgres);
        Assert.Equal(expectedTransient, PersistenceFailureClassifier.IsTransient(exception));
    }

    private static SentimentAnalysisClient CreateClient(HttpMessageHandler handler)
    {
        var http = new HttpClient(handler) { BaseAddress = new Uri("http://127.0.0.1:8001/") };
        var options = Options.Create(new AiServiceOptions
        {
            BaseUrl = "http://127.0.0.1:8001/",
            InternalServiceKey = InternalKey,
            TimeoutSeconds = 10
        });
        return new SentimentAnalysisClient(http, options);
    }

    private static HttpResponseMessage JsonResponse(string json) => new(HttpStatusCode.OK)
    {
        Content = new StringContent(json, Encoding.UTF8, "application/json")
    };

    private sealed class StubHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> send)
        : HttpMessageHandler
    {
        public string? LastBody { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            LastBody = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
            return await send(request, cancellationToken);
        }
    }
}
