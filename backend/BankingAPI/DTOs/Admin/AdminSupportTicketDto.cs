namespace BankingAPI.DTOs.Admin;

public class AdminSupportTicketDto
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string CustomerName { get; set; } = string.Empty;
    public string CustomerEmail { get; set; } = string.Empty;
    public int? AssignedOfficerId { get; set; }
    public string? AssignedOfficerName { get; set; }
    public string Subject { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string Priority { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class AssignAdminTicketRequestDto
{
    public int? OfficerId { get; set; }
}
