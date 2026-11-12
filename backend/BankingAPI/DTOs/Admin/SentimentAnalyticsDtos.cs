namespace BankingAPI.DTOs.Admin;

public sealed class SentimentDistributionDto
{
    public int TotalTickets { get; init; }
    public int AnalyzedTickets { get; init; }
    public int UnanalyzedTickets { get; init; }
    public int PositiveCount { get; init; }
    public int NeutralCount { get; init; }
    public int NegativeCount { get; init; }
    public decimal PositivePercentage { get; init; }
    public decimal NeutralPercentage { get; init; }
    public decimal NegativePercentage { get; init; }
}

public sealed class SentimentTrendPointDto
{
    public DateOnly Date { get; init; }
    public int PositiveCount { get; init; }
    public int NeutralCount { get; init; }
    public int NegativeCount { get; init; }
    public int TotalCount { get; init; }
}

public sealed class SentimentTrendsDto
{
    public DateOnly FromDate { get; init; }
    public DateOnly ToDate { get; init; }
    public List<SentimentTrendPointDto> Points { get; init; } = [];
}

public sealed class AdminTicketSentimentInsightDto
{
    public int TicketId { get; init; }
    public string Status { get; init; } = string.Empty;
    public string Priority { get; init; } = string.Empty;
    public string SentimentLabel { get; init; } = string.Empty;
    public double Confidence { get; init; }
    public DateTime AnalyzedAt { get; init; }
    public long EventSequence { get; init; }
}

public sealed class AdminTicketSentimentInsightsPageDto
{
    public int Page { get; init; }
    public int PageSize { get; init; }
    public int TotalCount { get; init; }
    public List<AdminTicketSentimentInsightDto> Items { get; init; } = [];
}

public sealed class SentimentTrendBucketDto
{
    public DateOnly Day { get; init; }
    public string SentimentLabel { get; init; } = string.Empty;
    public long Count { get; init; }
}
