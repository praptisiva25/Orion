using BankingAPI.Data;
using BankingAPI.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BankingAPI.Services.AI;

public sealed class TicketSentimentWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<TicketSentimentWorker> logger,
    IOptions<AiServiceOptions> aiOptions) : BackgroundService
{
    private const int MaxAttempts = 8;
    private readonly int _leaseSeconds = (int)ComputeLeaseDuration(aiOptions.Value.TimeoutSeconds).TotalSeconds;

    public static TimeSpan ComputeRetryDelay(int attempt) =>
        TimeSpan.FromSeconds(Math.Min(1800, 10 * Math.Pow(2, Math.Max(0, attempt - 1))));

    public static TimeSpan ComputeLeaseDuration(int timeoutSeconds)
    {
        var safeTimeout = timeoutSeconds is >= 1 and <= 180 ? timeoutSeconds : 75;
        return TimeSpan.FromSeconds(safeTimeout + 60);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var processed = await ProcessOneAsync(stoppingToken);
                if (!processed)
                    await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch
            {
                // Do not attach exception/request content; any upstream details may be sensitive.
                logger.LogWarning("Ticket sentiment worker cycle failed.");
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
        }
    }

    private async Task<bool> ProcessOneAsync(CancellationToken cancellationToken)
    {
        var lease = Guid.NewGuid();
        long? jobId;
        await using (var scope = scopeFactory.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                UPDATE "TicketSentimentJobs"
                SET "Status" = 'Failed', "LastFailureCategory" = 'RetryLimit', "UpdatedAt" = now()
                WHERE "Status" = 'Processing' AND "LeaseExpiresAt" < now() AND "Attempts" >= {MaxAttempts};
                """, cancellationToken);
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                UPDATE "TicketSentimentJobs"
                SET "Status" = 'Pending', "LeaseToken" = NULL, "LeaseExpiresAt" = NULL,
                    "NextAttemptAt" = now(), "UpdatedAt" = now()
                WHERE "Status" = 'Processing' AND "LeaseExpiresAt" < now() AND "Attempts" < {MaxAttempts};
                """, cancellationToken);

            var claimedIds = await db.Database.SqlQuery<long>($"""
                WITH candidate AS (
                    SELECT "Id" FROM "TicketSentimentJobs"
                    WHERE "Status" = 'Pending' AND "NextAttemptAt" <= now() AND "Attempts" < {MaxAttempts}
                    ORDER BY "CreatedAt", "Id"
                    FOR UPDATE SKIP LOCKED
                    LIMIT 1
                )
                UPDATE "TicketSentimentJobs" job
                SET "Status" = 'Processing', "LeaseToken" = {lease},
                    "LeaseExpiresAt" = now() + make_interval(secs => {_leaseSeconds}),
                    "Attempts" = job."Attempts" + 1, "UpdatedAt" = now()
                FROM candidate WHERE job."Id" = candidate."Id"
                RETURNING job."Id" AS "Value"
                """).ToListAsync(cancellationToken);
            jobId = claimedIds.Count == 0 ? null : claimedIds[0];
            await transaction.CommitAsync(cancellationToken);
        }

        if (jobId is null or 0)
            return false;

        try
        {
            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var client = scope.ServiceProvider.GetRequiredService<ISentimentAnalysisClient>();
            var job = await db.TicketSentimentJobs.AsNoTracking()
                .FirstAsync(j => j.Id == jobId && j.LeaseToken == lease, cancellationToken);
            var ticket = await db.SupportTickets.AsNoTracking()
                .FirstAsync(t => t.Id == job.SupportTicketId, cancellationToken);
            var text = await TicketSentimentContextBuilder.BuildAnalysisTextAsync(db, ticket, job, cancellationToken);
            var result = await client.AnalyzeAsync(text, cancellationToken);

            await using var completionScope = scopeFactory.CreateAsyncScope();
            var completionDb = completionScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await using var completionTransaction = await completionDb.Database.BeginTransactionAsync(cancellationToken);
            var current = await completionDb.TicketSentimentJobs
                .FirstOrDefaultAsync(j => j.Id == jobId && j.Status == "Processing" && j.LeaseToken == lease, cancellationToken);
            if (current is not null)
            {
                completionDb.TicketSentiments.Add(new TicketSentiment
                {
                    SupportTicketId = current.SupportTicketId,
                    TicketMessageId = current.TicketMessageId,
                    JobId = current.Id,
                    EventSequence = current.EventSequence,
                    AnalysisStage = current.AnalysisStage,
                    SentimentLabel = result.Label,
                    Confidence = result.Confidence,
                    ModelName = result.ModelName,
                    ModelRevision = result.ModelVersion,
                    AnalyzedAt = DateTime.UtcNow
                });
                current.Status = "Completed";
                current.LeaseToken = null;
                current.LeaseExpiresAt = null;
                current.LastFailureCategory = null;
                current.UpdatedAt = DateTime.UtcNow;
                await completionDb.SaveChangesAsync(cancellationToken);
            }
            await completionTransaction.CommitAsync(cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (SentimentServiceException exception)
        {
            await RecordFailureAsync(jobId.Value, lease,
                exception.Kind == SentimentFailureKind.Transient, exception.Kind.ToString(), cancellationToken);
        }
        catch (DbUpdateException exception)
        {
            var transient = PersistenceFailureClassifier.IsTransient(exception);
            await RecordFailureAsync(jobId.Value, lease, transient,
                transient ? "TransientPersistenceFailure" : "PermanentPersistenceFailure", cancellationToken);
            logger.LogWarning("Ticket sentiment result persistence failed; retryable={Retryable}.", transient);
        }
        catch
        {
            await RecordFailureAsync(jobId.Value, lease, true, "ProcessingFailure", cancellationToken);
            logger.LogWarning("Ticket sentiment job processing failed.");
        }

        return true;
    }

    private async Task RecordFailureAsync(long jobId, Guid lease, bool transient, string category,
        CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var job = await db.TicketSentimentJobs.FirstOrDefaultAsync(
            j => j.Id == jobId && j.Status == "Processing" && j.LeaseToken == lease, cancellationToken);
        if (job is null)
            return;

        job.LastFailureCategory = category;
        job.LeaseToken = null;
        job.LeaseExpiresAt = null;
        job.UpdatedAt = DateTime.UtcNow;
        if (!transient || job.Attempts >= MaxAttempts)
        {
            job.Status = "Failed";
        }
        else
        {
            job.Status = "Pending";
            job.NextAttemptAt = DateTime.UtcNow.Add(ComputeRetryDelay(job.Attempts));
        }
        await db.SaveChangesAsync(cancellationToken);
    }
}
