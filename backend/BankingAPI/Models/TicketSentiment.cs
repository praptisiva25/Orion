namespace BankingAPI.Models;

public sealed class TicketSentiment
{
    public long Id { get; set; }
    public int SupportTicketId { get; set; }
    public int? TicketMessageId { get; set; }
    public long JobId { get; set; }
    public long EventSequence { get; set; }
    public string AnalysisStage { get; set; } = "Initial";
    public string SentimentLabel { get; set; } = string.Empty;
    public double Confidence { get; set; }
    public string ModelName { get; set; } = string.Empty;
    public string? ModelRevision { get; set; }
    public DateTime AnalyzedAt { get; set; } = DateTime.UtcNow;
}
