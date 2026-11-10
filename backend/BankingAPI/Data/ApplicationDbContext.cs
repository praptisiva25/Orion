using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using BankingAPI.Models;


namespace BankingAPI.Data
{
    public class ApplicationDbContext : IdentityDbContext<
        ApplicationUser,
        IdentityRole<int>,
        int>
    {
        public ApplicationDbContext(
            DbContextOptions<ApplicationDbContext> options)
            : base(options)
        {
        }

        // Existing legacy Users table
        public DbSet<User> LegacyUsers => Set<User>();
        public DbSet<CustomerProfile> CustomerProfiles => Set<CustomerProfile>();
        public DbSet<BankingProduct> BankingProducts => Set<BankingProduct>();
        public DbSet<ProductApplication> ProductApplications => Set<ProductApplication>();
        public DbSet<KycDocument> KycDocuments => Set<KycDocument>();
        public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
        public DbSet<Notification> Notifications => Set<Notification>();
        public DbSet<SupportTicket> SupportTickets => Set<SupportTicket>();
        public DbSet<TicketMessage> TicketMessages => Set<TicketMessage>();
        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.Entity<CustomerProfile>()
             .HasOne<ApplicationUser>()
             .WithOne()
             .HasForeignKey<CustomerProfile>(p => p.UserId)
             .OnDelete(DeleteBehavior.Cascade);
            
            modelBuilder.Entity<CustomerProfile>()
             .HasIndex(p => p.UserId)
             .IsUnique();

            modelBuilder.Entity<ProductApplication>()
             .HasOne<ApplicationUser>()
             .WithMany()
             .HasForeignKey(a => a.UserId)
             .OnDelete(DeleteBehavior.Restrict);
             
            modelBuilder.Entity<ProductApplication>()
             .HasOne<BankingProduct>()
             .WithMany()
             .HasForeignKey(a => a.BankingProductId)
             .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<ProductApplication>()
             .HasOne<ApplicationUser>()
             .WithMany()
             .HasForeignKey(a => a.ReviewedBy)
             .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<KycDocument>()
             .HasOne<ApplicationUser>()
             .WithMany()
             .HasForeignKey(k => k.UserId)
             .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<KycDocument>()
             .HasOne<ApplicationUser>()
             .WithMany()
             .HasForeignKey(k => k.ReviewedBy)
             .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<User>(entity =>
            {
                entity.ToTable("Users");

                entity.HasIndex(u => u.Email)
                    .IsUnique();
            });

            modelBuilder.Entity<SupportTicket>()
            .HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(t => t.UserId)
            .OnDelete(DeleteBehavior.Restrict);
            
            modelBuilder.Entity<SupportTicket>()
            .HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(t => t.AssignedOfficerId)
            .OnDelete(DeleteBehavior.Restrict);
            
            modelBuilder.Entity<TicketMessage>()
            .HasOne<SupportTicket>()
            .WithMany()
            .HasForeignKey(m => m.SupportTicketId)
            .OnDelete(DeleteBehavior.Cascade);
            
            modelBuilder.Entity<TicketMessage>()
            .HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(m => m.SenderUserId)
            .OnDelete(DeleteBehavior.Restrict);
            
            modelBuilder.Entity<TicketMessage>()
            .HasIndex(m => new { m.SupportTicketId, m.SentAt });
        }
    }
}
