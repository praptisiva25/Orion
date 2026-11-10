
using BankingAPI.Data;
using BankingAPI.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using BankingAPI.DTOs.Admin;

namespace BankingAPI.Controllers;

[ApiController]
[Route("api/admin/dashboard")]
[Authorize(Roles = "Admin")]
public class AdminDashboardController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly UserManager<ApplicationUser> _userManager;

    public AdminDashboardController(
        ApplicationDbContext db,
        UserManager<ApplicationUser> userManager)
    {
        _db = db;
        _userManager = userManager;
    }

    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary()
    {
        var customers = await _userManager.GetUsersInRoleAsync("Customer");
        var officers = await _userManager.GetUsersInRoleAsync("Officer");
        var recentApplications = await (
            from application in _db.ProductApplications
            join user in _db.Users
                on application.UserId equals user.Id
            join product in _db.BankingProducts
                on application.BankingProductId equals product.Id
            orderby application.AppliedAt descending
            select new RecentActivityDto
            {
                Type = "Application",
                Description = $"{user.FullName} applied for {product.Name}",
                Status = application.Status,
                Timestamp = application.ReviewedAt ?? application.AppliedAt
            }
        ).Take(10).ToListAsync();

        var recentKyc = await (
            from document in _db.KycDocuments
            join user in _db.Users
                on document.UserId equals user.Id
            orderby document.UploadedAt descending
            select new RecentActivityDto
            {
                Type = "KYC",
                Description = $"{user.FullName} uploaded a {document.DocumentType} document",
                Status = document.Status,
                Timestamp = document.ReviewedAt ?? document.UploadedAt
            }
        ).Take(10).ToListAsync();

        var recentTickets = await (
            from ticket in _db.SupportTickets.AsNoTracking()
            join customer in _db.Users.AsNoTracking() on ticket.UserId equals customer.Id
            join assigned in _db.Users.AsNoTracking()
                on ticket.AssignedOfficerId equals (int?)assigned.Id into assignedUsers
            from assigned in assignedUsers.DefaultIfEmpty()
            orderby ticket.UpdatedAt descending
            select new RecentActivityDto
            {
                Type = "Support Ticket",
                Description = $"{ticket.Subject} · {customer.FullName}" +
                    (assigned == null ? " · Unassigned" : $" · Assigned to {assigned.FullName}"),
                Status = ticket.Status,
                Timestamp = ticket.UpdatedAt
            }).Take(5).ToListAsync();

        var recentOfficers = officers.OrderByDescending(o => o.CreatedAt)
            .Take(5)
            .Select(o => new AdminOfficerSummaryDto
            {
                Id = o.Id,
                FullName = o.FullName,
                Email = o.Email ?? string.Empty,
                IsActive = o.IsActive,
                CreatedAt = o.CreatedAt
            }).ToList();

        var dashboard = new AdminDashboardDto
        {
            TotalCustomers = customers.Count,
            TotalOfficers = officers.Count,
            TotalBankingProducts = await _db.BankingProducts.CountAsync(),
            TotalApplications = await _db.ProductApplications.CountAsync(),
            PendingApplications = await _db.ProductApplications.CountAsync(a => a.Status == "Pending"),
            ApprovedApplications = await _db.ProductApplications.CountAsync(a => a.Status == "Approved"),
            RejectedApplications = await _db.ProductApplications.CountAsync(a => a.Status == "Rejected"),
            TotalKycDocuments = await _db.KycDocuments.CountAsync(),
            PendingKyc = await _db.KycDocuments.CountAsync(k => k.Status == "Pending"),
            TotalSupportTickets = await _db.SupportTickets.CountAsync(),
            OpenSupportTickets = await _db.SupportTickets.CountAsync(t => t.Status == "Open"),
            ResolvedSupportTickets = await _db.SupportTickets.CountAsync(t => t.Status == "Resolved" || t.Status == "Closed"),
            RecentApplications = recentApplications,
            RecentKycSubmissions = recentKyc,
            RecentSupportTickets = recentTickets,
            RecentOfficers = recentOfficers
        };
        
        return Ok(dashboard);
    }
}

