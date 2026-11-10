
using System.ComponentModel.DataAnnotations;

namespace BankingAPI.Models;

public class ProductApplication
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int BankingProductId { get; set; }

    public decimal RequestedAmount { get; set; }

    [MaxLength(1000)]
    public string? Remarks { get; set; }

    public string Status { get; set; } = "Pending";

    public DateTime AppliedAt { get; set; } = DateTime.UtcNow;

    public DateTime? ReviewedAt { get; set; }

    public int? ReviewedBy { get; set; }

    [MaxLength(1000)]
    public string? ReviewReason { get; set; }
}
