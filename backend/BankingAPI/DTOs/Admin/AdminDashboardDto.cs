namespace BankingAPI.DTOs.Admin;

public class AdminDashboardDto
{
    public int TotalCustomers { get; set; }
    public int TotalOfficers { get; set; }
    public int TotalBankingProducts { get; set; }
    public int TotalApplications { get; set; }
    public int PendingApplications { get; set; }
    public int ApprovedApplications { get; set; }
    public int RejectedApplications { get; set; }
    public int TotalKycDocuments { get; set; }
    public int PendingKyc { get; set; }
    public int TotalSupportTickets { get; set; }
    public int OpenSupportTickets { get; set; }
    public int ResolvedSupportTickets { get; set; }
    public List<RecentActivityDto> RecentApplications { get; set; } = new();
    public List<RecentActivityDto> RecentKycSubmissions { get; set; } = new();
    public List<RecentActivityDto> RecentSupportTickets { get; set; } = new();
    public List<AdminOfficerSummaryDto> RecentOfficers { get; set; } = new();
}

public class AdminOfficerSummaryDto
{
    public int Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
}
