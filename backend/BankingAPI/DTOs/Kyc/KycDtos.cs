
using System.ComponentModel.DataAnnotations;

namespace BankingAPI.DTOs.Kyc;

public class KycUploadRequestDto
{
    [Required]
    [RegularExpression("^(PAN|Aadhaar)$",
        ErrorMessage = "Document type must be PAN or Aadhaar.")]
    public string DocumentType { get; set; } = string.Empty;
}

public class KycDocumentResponseDto
{
    public int Id { get; set; }
    public int? UserId { get; set; }
    public string? CustomerName { get; set; }
    public string? CustomerEmail { get; set; }
    public string DocumentType { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTime UploadedAt { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public string? ReviewerName { get; set; }
    public string? ReviewReason { get; set; }
}

public class KycReviewRequestDto
{
    [Required]
    [RegularExpression("^(Verified|Rejected)$",
        ErrorMessage = "Status must be Verified or Rejected.")]
    public string Status { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? ReviewReason { get; set; }
}
