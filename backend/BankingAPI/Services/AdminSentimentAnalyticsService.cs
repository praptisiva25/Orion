using BankingAPI.Data;
using BankingAPI.DTOs.Admin;
using BankingAPI.Services.AI;
using Microsoft.EntityFrameworkCore;

namespace BankingAPI.Services;

public sealed class AdminSentimentAnalyticsService(
    ApplicationDbContext db,
    ITicketSentimentQueryService ticketSentiments)
{
    private const int MaximumRangeDays = 366;
    private const int MaximumPageSize = 100;

    public static bool TryResolveRange(DateOnly? fromDate, DateOnly? toDate,
        out ResolvedSentimentDateRange range, out string error)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var resolvedFrom = fromDate ?? today.AddDays(-29);
        var resolvedTo = toDate ?? today;

        if (resolvedFrom > resolvedTo)
        {
            range = default;
            error = "fromDate must be on or before toDate.";
            return false;
        }

        if (resolvedTo > today)
        {
            range = default;
            error = "toDate cannot be in the future.";
            return false;
        }

        if (resolvedTo.DayNumber - resolvedFrom.DayNumber + 1 > MaximumRangeDays)
        {
            range = default;
            error = $"Date range cannot exceed {MaximumRangeDays} days.";
            return false;
        }

        range = new ResolvedSentimentDateRange(
            resolvedFrom,
            resolvedTo,
            resolvedFrom.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc),
            resolvedTo.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc));
        error = string.Empty;
        return true;
    }

    public async Task<SentimentDistributionDto> GetDistributionAsync(CancellationToken cancellationToken)
    {
        var totalTickets = await db.SupportTickets.CountAsync(cancellationToken);
        var counts = await ticketSentiments.GetLatestSuccessfulPerTicketQuery()
            .GroupBy(sentiment => sentiment.SentimentLabel)
            .Select(group => new { Label = group.Key, Count = group.Count() })
            .ToListAsync(cancellationToken);

        var positive = counts.FirstOrDefault(row => row.Label == "positive")?.Count ?? 0;
        var neutral = counts.FirstOrDefault(row => row.Label == "neutral")?.Count ?? 0;
        var negative = counts.FirstOrDefault(row => row.Label == "negative")?.Count ?? 0;
        var analyzed = positive + neutral + negative;

        decimal Percentage(int value) => analyzed == 0
            ? 0
            : decimal.Round(value * 100m / analyzed, 2, MidpointRounding.AwayFromZero);

        return new SentimentDistributionDto
        {
            TotalTickets = totalTickets,
            AnalyzedTickets = analyzed,
            UnanalyzedTickets = Math.Max(0, totalTickets - analyzed),
            PositiveCount = positive,
            NeutralCount = neutral,
            NegativeCount = negative,
            PositivePercentage = Percentage(positive),
            NeutralPercentage = Percentage(neutral),
            NegativePercentage = Percentage(negative)
        };
    }

    public async Task<SentimentTrendsDto> GetTrendsAsync(
        ResolvedSentimentDateRange range,
        CancellationToken cancellationToken)
    {
        var buckets = await db.Database.SqlQuery<SentimentTrendBucketDto>($"""
            SELECT ( ("AnalyzedAt" AT TIME ZONE 'UTC')::date ) AS "Day",
                   "SentimentLabel" AS "SentimentLabel",
                   COUNT(*)::bigint AS "Count"
            FROM "TicketSentiments"
            WHERE "AnalyzedAt" >= {range.StartUtc} AND "AnalyzedAt" < {range.EndExclusiveUtc}
            GROUP BY ( ("AnalyzedAt" AT TIME ZONE 'UTC')::date ), "SentimentLabel"
            ORDER BY "Day", "SentimentLabel"
            """).ToListAsync(cancellationToken);

        var byDayAndLabel = buckets.ToDictionary(
            bucket => (bucket.Day, bucket.SentimentLabel),
            bucket => checked((int)bucket.Count));
        var points = new List<SentimentTrendPointDto>(range.ToDate.DayNumber - range.FromDate.DayNumber + 1);
        for (var day = range.FromDate; day <= range.ToDate; day = day.AddDays(1))
        {
            var positive = byDayAndLabel.GetValueOrDefault((day, "positive"));
            var neutral = byDayAndLabel.GetValueOrDefault((day, "neutral"));
            var negative = byDayAndLabel.GetValueOrDefault((day, "negative"));
            points.Add(new SentimentTrendPointDto
            {
                Date = day,
                PositiveCount = positive,
                NeutralCount = neutral,
                NegativeCount = negative,
                TotalCount = positive + neutral + negative
            });
        }

        return new SentimentTrendsDto { FromDate = range.FromDate, ToDate = range.ToDate, Points = points };
    }

    public async Task<AdminTicketSentimentInsightsPageDto?> GetTicketInsightsAsync(
        string? label,
        int page,
        int pageSize,
        CancellationToken cancellationToken)
    {
        if (page < 1 || pageSize is < 1 or > MaximumPageSize ||
            (long)(page - 1) * pageSize > int.MaxValue)
            return null;
        if (label is not null && label is not ("positive" or "neutral" or "negative"))
            return null;

        var query = from sentiment in ticketSentiments.GetLatestSuccessfulPerTicketQuery()
                    join ticket in db.SupportTickets.AsNoTracking()
                        on sentiment.SupportTicketId equals ticket.Id
                    select new AdminTicketSentimentInsightDto
                    {
                        TicketId = ticket.Id,
                        Status = ticket.Status,
                        Priority = ticket.Priority,
                        SentimentLabel = sentiment.SentimentLabel,
                        Confidence = sentiment.Confidence,
                        AnalyzedAt = sentiment.AnalyzedAt,
                        EventSequence = sentiment.EventSequence
                    };

        if (label is not null)
            query = query.Where(item => item.SentimentLabel == label);

        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query.OrderByDescending(item => item.AnalyzedAt)
            .ThenByDescending(item => item.TicketId)
            .Skip((int)((long)(page - 1) * pageSize))
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return new AdminTicketSentimentInsightsPageDto
        {
            Page = page,
            PageSize = pageSize,
            TotalCount = totalCount,
            Items = items
        };
    }
}

public readonly record struct ResolvedSentimentDateRange(
    DateOnly FromDate,
    DateOnly ToDate,
    DateTime StartUtc,
    DateTime EndExclusiveUtc);
