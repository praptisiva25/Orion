
using System.ComponentModel.DataAnnotations;

namespace BankingAPI.Models;

public class SupportTicket
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int? AssignedOfficerId { get; set; }

    [Required, MaxLength(150)]
    public string Subject { get; set; } = string.Empty;

    [Required, MaxLength(3000)]
    public string Description { get; set; } = string.Empty;

    [MaxLength(30)]
    public string Status { get; set; } = "Open";

    [MaxLength(20)]
    public string Priority { get; set; } = "Normal";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Orders customer-originated sentiment events, even when model calls finish out of order.
    public long SentimentEventSequence { get; set; }
}
