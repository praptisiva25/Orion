using System.ComponentModel.DataAnnotations;

namespace BankingAPI.Models;

public class KycDocument
{
    public int Id { get; set; }

    public int UserId { get; set; }

    [Required, MaxLength(50)]
    public string DocumentType { get; set; } = string.Empty;

    [Required, MaxLength(255)]
    public string FileName { get; set; } = string.Empty;

    [Required, MaxLength(500)]
    public string FilePath { get; set; } = string.Empty;

    [MaxLength(20)]
    public string Status { get; set; } = "Pending";

    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;

    public DateTime? ReviewedAt { get; set; }
    public int? ReviewedBy { get; set; }

    [MaxLength(1000)]
    public string? ReviewReason { get; set; }
}
