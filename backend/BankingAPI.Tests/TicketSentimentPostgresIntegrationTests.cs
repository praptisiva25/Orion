using System.Security.Claims;
using BankingAPI.Controllers;
using BankingAPI.Data;
using BankingAPI.DTOs.SupportTickets;
using BankingAPI.Models;
using BankingAPI.Services;
using BankingAPI.Services.AI;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace BankingAPI.Tests;

public sealed class TicketSentimentPostgresIntegrationTests
{
    [PostgresFact]
    public async Task TwoWorkers_OnlyOneClaimsAndAnalyzesTheSameJob()
    {
        var database = await PostgresTestDatabase.CreateRequiredAsync();
        await using var dbLease = database;
        var customerId = await database.CreateCustomerAsync();
        var ticket = await database.CreateTicketAsync(customerId);
        await AddJobAsync(database, ticket.Id, 0);

        var client = new BlockingSentimentClient();
        await using var host1 = CreateWorkerHost(database, client);
        await using var host2 = CreateWorkerHost(database, client);
        await host1.StartAsync();
        await host2.StartAsync();

        try
        {
            await client.Entered.Task.WaitAsync(TimeSpan.FromSeconds(12));
            await Task.Delay(TimeSpan.FromSeconds(4)); // More than one worker poll while the first lease is held.
            Assert.Equal(1, client.CallCount);
            client.Release();
            await WaitForJobStatusAsync(database, ticket.Id, "Completed");

            await using var db = database.CreateContext();
            Assert.Equal(1, await db.TicketSentiments.CountAsync());
        }
        finally
        {
            client.Release();
            await host1.StopAsync();
            await host2.StopAsync();
        }
    }

    [PostgresFact]
    public async Task Worker_ReclaimsAnExpiredLeaseAfterRestart()
    {
        var database = await PostgresTestDatabase.CreateRequiredAsync();
        await using var dbLease = database;
        var customerId = await database.CreateCustomerAsync();
        var ticket = await database.CreateTicketAsync(customerId);
        await AddJobAsync(database, ticket.Id, 0, status: "Processing", attempts: 1,
            leaseToken: Guid.NewGuid(), leaseExpiresAt: DateTime.UtcNow.AddMinutes(-1));

        await using var host = CreateWorkerHost(database, new ImmediateSentimentClient());
        await host.StartAsync();
        try
        {
            await WaitForJobStatusAsync(database, ticket.Id, "Completed");
            await using var db = database.CreateContext();
            var job = await db.TicketSentimentJobs.SingleAsync();
            Assert.Equal(2, job.Attempts);
            Assert.Single(await db.TicketSentiments.ToListAsync());
        }
        finally
        {
            await host.StopAsync();
        }
    }

    [PostgresFact]
    public async Task CustomerTicketAndJob_RollBackTogetherWhenOutboxInsertFails()
    {
        var database = await PostgresTestDatabase.CreateRequiredAsync();
        await using var dbLease = database;
        var customerId = await database.CreateCustomerAsync();
        await CreateRejectingJobTriggerAsync(database);
        var controller = CreateSupportController(database.CreateContext(), customerId);

        await Assert.ThrowsAsync<DbUpdateException>(() => controller.CreateTicket(
            new CreateSupportTicketRequestDto
            {
                Subject = "Synthetic atomic ticket",
                Description = "Synthetic description",
                Priority = "Normal"
            }, CancellationToken.None));

        await using var verify = database.CreateContext();
        Assert.Empty(await verify.SupportTickets.ToListAsync());
        Assert.Empty(await verify.TicketSentimentJobs.ToListAsync());
    }

    [PostgresFact]
    public async Task CustomerMessageAndJob_RollBackTogetherWhenOutboxInsertFails()
    {
        var database = await PostgresTestDatabase.CreateRequiredAsync();
        await using var dbLease = database;
        var customerId = await database.CreateCustomerAsync();
        var ticket = await database.CreateTicketAsync(customerId);
        await CreateRejectingJobTriggerAsync(database);
        var controller = CreateSupportController(database.CreateContext(), customerId);

        await Assert.ThrowsAsync<DbUpdateException>(() => controller.SendMessage(
            ticket.Id, new CreateTicketMessageRequestDto { Message = "Synthetic customer follow-up" },
            CancellationToken.None));

        await using var verify = database.CreateContext();
        var persistedTicket = await verify.SupportTickets.SingleAsync(t => t.Id == ticket.Id);
        Assert.Equal(0, persistedTicket.SentimentEventSequence);
        Assert.Empty(await verify.TicketMessages.ToListAsync());
        Assert.Empty(await verify.TicketSentimentJobs.ToListAsync());
    }

    [PostgresFact]
    public async Task ConcurrentCustomerMessages_GetDistinctOrderedSequences()
    {
        var database = await PostgresTestDatabase.CreateRequiredAsync();
        await using var dbLease = database;
        var customerId = await database.CreateCustomerAsync();
        var ticket = await database.CreateTicketAsync(customerId);

        var first = Task.Run(() => CreateSupportController(database.CreateContext(), customerId)
            .SendMessage(ticket.Id, new CreateTicketMessageRequestDto { Message = "Synthetic concurrent message one" }, CancellationToken.None));
        var second = Task.Run(() => CreateSupportController(database.CreateContext(), customerId)
            .SendMessage(ticket.Id, new CreateTicketMessageRequestDto { Message = "Synthetic concurrent message two" }, CancellationToken.None));
        await Task.WhenAll(first, second);

        await using var verify = database.CreateContext();
        var persistedTicket = await verify.SupportTickets.SingleAsync(t => t.Id == ticket.Id);
        var events = await verify.TicketSentimentJobs.Where(j => j.SupportTicketId == ticket.Id)
            .OrderBy(j => j.EventSequence).ToListAsync();
        Assert.Equal(2, persistedTicket.SentimentEventSequence);
        Assert.Equal(new long[] { 1, 2 }, events.Select(item => item.EventSequence));
        Assert.Equal(2, events.Select(item => item.TicketMessageId).Distinct().Count());
    }

    [PostgresFact]
    public async Task ContextBuilder_IncludesLegacyCustomerMessagesAndExcludesOfficerAndLaterMessages()
    {
        var database = await PostgresTestDatabase.CreateRequiredAsync();
        await using var dbLease = database;
        var customerId = await database.CreateCustomerAsync();
        var ticket = await database.CreateTicketAsync(customerId);
        int currentMessageId;
        await using (var seed = database.CreateContext())
        {
            seed.TicketMessages.AddRange(
                NewMessage(ticket.Id, customerId, "Customer", "legacy customer message"),
                NewMessage(ticket.Id, customerId, "Officer", "private officer response"));
            await seed.SaveChangesAsync();
            var current = NewMessage(ticket.Id, customerId, "Customer", "event customer message");
            seed.TicketMessages.Add(current);
            await seed.SaveChangesAsync();
            currentMessageId = current.Id;
            seed.TicketMessages.Add(NewMessage(ticket.Id, customerId, "Customer", "future customer message"));
            await seed.SaveChangesAsync();
        }

        await using var db = database.CreateContext();
        var job = new TicketSentimentJob
        {
            SupportTicketId = ticket.Id,
            TicketMessageId = currentMessageId,
            EventSequence = 1,
            AnalysisStage = "CustomerFollowUp"
        };
        var context = await TicketSentimentContextBuilder.BuildAnalysisTextAsync(
            db, ticket, job, CancellationToken.None);

        Assert.Contains(ticket.Description, context);
        Assert.Contains("legacy customer message", context);
        Assert.Contains("event customer message", context);
        Assert.DoesNotContain("private officer response", context);
        Assert.DoesNotContain("future customer message", context);
    }

    [PostgresFact]
    public async Task LatestLookup_UsesGreatestSuccessfulEventSequenceNotCompletionTime()
    {
        var database = await PostgresTestDatabase.CreateRequiredAsync();
        await using var dbLease = database;
        var customerId = await database.CreateCustomerAsync();
        var ticket = await database.CreateTicketAsync(customerId);
        await using (var db = database.CreateContext())
        {
            var olderJob = new TicketSentimentJob { SupportTicketId = ticket.Id, EventSequence = 2, Status = "Completed" };
            var newerJob = new TicketSentimentJob { SupportTicketId = ticket.Id, EventSequence = 3, Status = "Completed" };
            var failedNewerJob = new TicketSentimentJob { SupportTicketId = ticket.Id, EventSequence = 4, Status = "Failed" };
            db.TicketSentimentJobs.AddRange(olderJob, newerJob, failedNewerJob);
            await db.SaveChangesAsync();
            db.TicketSentiments.AddRange(
                NewSentiment(ticket.Id, olderJob.Id, 2, DateTime.UtcNow.AddMinutes(1), "negative"),
                NewSentiment(ticket.Id, newerJob.Id, 3, DateTime.UtcNow, "positive"));
            await db.SaveChangesAsync();
        }

        await using var queryDb = database.CreateContext();
        var result = await new TicketSentimentQueryService(queryDb)
            .GetLatestSuccessfulAsync(ticket.Id, CancellationToken.None);
        Assert.NotNull(result);
        Assert.Equal(3, result.EventSequence);
        Assert.Equal("positive", result.SentimentLabel);
    }

    [PostgresFact]
    public async Task TransientPersistenceFailure_IsRetriedAndEventuallyStored()
    {
        var database = await PostgresTestDatabase.CreateRequiredAsync();
        await using var dbLease = database;
        var customerId = await database.CreateCustomerAsync();
        var ticket = await database.CreateTicketAsync(customerId);
        await AddJobAsync(database, ticket.Id, 0);
        await CreateOneTimeTransientSentimentFailureTriggerAsync(database);

        await using var host = CreateWorkerHost(database, new ImmediateSentimentClient());
        await host.StartAsync();
        try
        {
            await WaitForFailureCategoryAsync(database, ticket.Id, "TransientPersistenceFailure");
            await using (var db = database.CreateContext())
            {
                var retried = await db.TicketSentimentJobs.SingleAsync();
                Assert.Equal(1, retried.Attempts);
                Assert.Equal("TransientPersistenceFailure", retried.LastFailureCategory);
                retried.NextAttemptAt = DateTime.UtcNow.AddSeconds(-1); // Advance the test clock without sleeping 10 seconds.
                await db.SaveChangesAsync();
            }

            await WaitForJobStatusAsync(database, ticket.Id, "Completed");
            await using var verify = database.CreateContext();
            Assert.Equal(2, (await verify.TicketSentimentJobs.SingleAsync()).Attempts);
            Assert.Single(await verify.TicketSentiments.ToListAsync());
        }
        finally
        {
            await host.StopAsync();
        }
    }

    [PostgresFact]
    public async Task PermanentPersistenceFailure_IsNotRetried()
    {
        var database = await PostgresTestDatabase.CreateRequiredAsync();
        await using var dbLease = database;
        var customerId = await database.CreateCustomerAsync();
        var ticket = await database.CreateTicketAsync(customerId);
        await AddJobAsync(database, ticket.Id, 0);
        await CreatePermanentSentimentFailureTriggerAsync(database);

        await using var host = CreateWorkerHost(database, new ImmediateSentimentClient());
        await host.StartAsync();
        try
        {
            await WaitForJobStatusAsync(database, ticket.Id, "Failed");
            await using var verify = database.CreateContext();
            var job = await verify.TicketSentimentJobs.SingleAsync();
            Assert.Equal(1, job.Attempts);
            Assert.Equal("PermanentPersistenceFailure", job.LastFailureCategory);
            Assert.Empty(await verify.TicketSentiments.ToListAsync());
        }
        finally
        {
            await host.StopAsync();
        }
    }

    private static async Task AddJobAsync(PostgresTestDatabase database, int ticketId, long sequence,
        string status = "Pending", int attempts = 0, Guid? leaseToken = null, DateTime? leaseExpiresAt = null)
    {
        await using var db = database.CreateContext();
        db.TicketSentimentJobs.Add(new TicketSentimentJob
        {
            SupportTicketId = ticketId,
            EventSequence = sequence,
            AnalysisStage = "Initial",
            Status = status,
            Attempts = attempts,
            LeaseToken = leaseToken,
            LeaseExpiresAt = leaseExpiresAt,
            NextAttemptAt = DateTime.UtcNow.AddMinutes(-1)
        });
        await db.SaveChangesAsync();
    }

    private static TicketMessage NewMessage(int ticketId, int senderId, string role, string content) => new()
    {
        SupportTicketId = ticketId,
        SenderUserId = senderId,
        SenderRole = role,
        Message = content,
        SentAt = DateTime.UtcNow
    };

    private static TicketSentiment NewSentiment(int ticketId, long jobId, long sequence, DateTime analyzedAt, string label) => new()
    {
        SupportTicketId = ticketId,
        JobId = jobId,
        EventSequence = sequence,
        AnalysisStage = "CustomerFollowUp",
        SentimentLabel = label,
        Confidence = 0.8,
        ModelName = "synthetic-model",
        AnalyzedAt = analyzedAt
    };

    private static async Task CreateRejectingJobTriggerAsync(PostgresTestDatabase database)
    {
        await using var db = database.CreateContext();
        await db.Database.ExecuteSqlRawAsync("""
            CREATE FUNCTION reject_sentiment_job() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'synthetic outbox rejection' USING ERRCODE = '23514'; END;
            $$;
            """);
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TRIGGER reject_sentiment_job BEFORE INSERT ON "TicketSentimentJobs"
            FOR EACH ROW EXECUTE FUNCTION reject_sentiment_job();
            """);
    }

    private static async Task CreateOneTimeTransientSentimentFailureTriggerAsync(PostgresTestDatabase database)
    {
        await using var db = database.CreateContext();
        await db.Database.ExecuteSqlRawAsync("CREATE SEQUENCE sentiment_insert_failure_once");
        await db.Database.ExecuteSqlRawAsync("""
            CREATE FUNCTION fail_first_sentiment_insert() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                IF nextval('sentiment_insert_failure_once') = 1 THEN
                    RAISE EXCEPTION 'synthetic transient persistence failure' USING ERRCODE = '40001';
                END IF;
                RETURN NEW;
            END;
            $$;
            """);
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TRIGGER fail_first_sentiment_insert BEFORE INSERT ON "TicketSentiments"
            FOR EACH ROW EXECUTE FUNCTION fail_first_sentiment_insert();
            """);
    }

    private static async Task CreatePermanentSentimentFailureTriggerAsync(PostgresTestDatabase database)
    {
        await using var db = database.CreateContext();
        await db.Database.ExecuteSqlRawAsync("""
            CREATE FUNCTION reject_sentiment_history() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'synthetic permanent persistence failure' USING ERRCODE = '23514'; END;
            $$;
            """);
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TRIGGER reject_sentiment_history BEFORE INSERT ON "TicketSentiments"
            FOR EACH ROW EXECUTE FUNCTION reject_sentiment_history();
            """);
    }

    private static SupportTicketsController CreateSupportController(ApplicationDbContext db, int customerId)
    {
        var controller = new SupportTicketsController(db, new AuditLogService(db), new NotificationService(db));
        var identity = new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, customerId.ToString()), new Claim(ClaimTypes.Role, "Customer")],
            "IntegrationTest");
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(identity) }
        };
        return controller;
    }

    private static async Task WaitForJobStatusAsync(PostgresTestDatabase database, int ticketId, string status)
    {
        var until = DateTime.UtcNow.AddSeconds(20);
        while (DateTime.UtcNow < until)
        {
            await using var db = database.CreateContext();
            if (await db.TicketSentimentJobs.AnyAsync(job => job.SupportTicketId == ticketId && job.Status == status))
                return;
            await Task.Delay(100);
        }
        Assert.Fail($"Job did not reach expected status '{status}'.");
    }

    private static async Task WaitForFailureCategoryAsync(PostgresTestDatabase database, int ticketId, string category)
    {
        var until = DateTime.UtcNow.AddSeconds(20);
        while (DateTime.UtcNow < until)
        {
            await using var db = database.CreateContext();
            if (await db.TicketSentimentJobs.AnyAsync(job =>
                    job.SupportTicketId == ticketId && job.LastFailureCategory == category))
                return;
            await Task.Delay(100);
        }
        Assert.Fail($"Job did not record expected failure category '{category}'.");
    }

    private static WorkerHost CreateWorkerHost(PostgresTestDatabase database, ISentimentAnalysisClient client)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddDbContext<ApplicationDbContext>(options => options.UseNpgsql(database.ConnectionString));
        services.AddSingleton(client);
        var provider = services.BuildServiceProvider();
        var worker = new TicketSentimentWorker(
            provider.GetRequiredService<IServiceScopeFactory>(),
            NullLogger<TicketSentimentWorker>.Instance,
            Options.Create(new AiServiceOptions { TimeoutSeconds = 180 }));
        return new WorkerHost(provider, worker);
    }

    private sealed class WorkerHost(ServiceProvider provider, TicketSentimentWorker worker) : IAsyncDisposable
    {
        public Task StartAsync() => worker.StartAsync(CancellationToken.None);
        public Task StopAsync() => worker.StopAsync(CancellationToken.None);
        public ValueTask DisposeAsync()
        {
            provider.Dispose();
            return ValueTask.CompletedTask;
        }
    }

    private sealed class ImmediateSentimentClient : ISentimentAnalysisClient
    {
        public Task<BankingAPI.DTOs.AI.SentimentAnalysisResponseDto> AnalyzeAsync(string text, CancellationToken cancellationToken) =>
            Task.FromResult(new BankingAPI.DTOs.AI.SentimentAnalysisResponseDto
            {
                Label = "neutral",
                Confidence = 0.75,
                ModelName = "synthetic-model",
                ModelVersion = "test"
            });
    }

    private sealed class BlockingSentimentClient : ISentimentAnalysisClient
    {
        private readonly TaskCompletionSource<BankingAPI.DTOs.AI.SentimentAnalysisResponseDto> _release =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
        private int _callCount;

        public int CallCount => Volatile.Read(ref _callCount);
        public TaskCompletionSource<bool> Entered { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public Task<BankingAPI.DTOs.AI.SentimentAnalysisResponseDto> AnalyzeAsync(string text, CancellationToken cancellationToken)
        {
            Interlocked.Increment(ref _callCount);
            Entered.TrySetResult(true);
            return _release.Task.WaitAsync(cancellationToken);
        }

        public void Release() => _release.TrySetResult(new BankingAPI.DTOs.AI.SentimentAnalysisResponseDto
        {
            Label = "neutral",
            Confidence = 0.75,
            ModelName = "synthetic-model",
            ModelVersion = "test"
        });
    }
}
