namespace BankingAPI.Models;

public sealed class TicketSentimentJob
{
    public long Id { get; set; }
    public int SupportTicketId { get; set; }
    public int? TicketMessageId { get; set; }
    public long EventSequence { get; set; }
    public string AnalysisStage { get; set; } = "Initial";
    public string Status { get; set; } = "Pending";
    public int Attempts { get; set; }
    public DateTime NextAttemptAt { get; set; } = DateTime.UtcNow;
    public DateTime? LeaseExpiresAt { get; set; }
    public Guid? LeaseToken { get; set; }
    public string? LastFailureCategory { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
