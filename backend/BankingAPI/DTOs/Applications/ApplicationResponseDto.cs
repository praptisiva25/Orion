
namespace BankingAPI.DTOs.Applications;

public class ApplicationResponseDto
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string? CustomerName { get; set; }
    public string? CustomerEmail { get; set; }
    public int BankingProductId { get; set; }
    public string Product { get; set; } = string.Empty;
    public decimal RequestedAmount { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? Remarks { get; set; }
    public DateTime AppliedAt { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public string? ReviewerName { get; set; }
    public string? ReviewReason { get; set; }
}
