
using System.ComponentModel.DataAnnotations;

namespace BankingAPI.DTOs.Applications;

public class UpdateApplicationStatusRequestDto
{
    [Required]
    [RegularExpression("^(Approved|Rejected)$",
        ErrorMessage = "Status must be Approved or Rejected.")]
    public string Status { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? ReviewReason { get; set; }
}
