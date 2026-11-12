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
        public DbSet<TicketSentimentJob> TicketSentimentJobs => Set<TicketSentimentJob>();
        public DbSet<TicketSentiment> TicketSentiments => Set<TicketSentiment>();
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

            modelBuilder.Entity<TicketSentimentJob>(entity =>
            {
                entity.HasOne<SupportTicket>().WithMany().HasForeignKey(j => j.SupportTicketId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne<TicketMessage>().WithMany().HasForeignKey(j => j.TicketMessageId)
                    .OnDelete(DeleteBehavior.SetNull);
                entity.HasIndex(j => new { j.Status, j.NextAttemptAt, j.CreatedAt });
                entity.HasIndex(j => new { j.SupportTicketId, j.EventSequence }).IsUnique();
                entity.Property(j => j.AnalysisStage).HasMaxLength(20);
                entity.Property(j => j.Status).HasMaxLength(20);
                entity.Property(j => j.LastFailureCategory).HasMaxLength(50);
            });

            modelBuilder.Entity<TicketSentiment>(entity =>
            {
                entity.HasOne<SupportTicket>().WithMany().HasForeignKey(s => s.SupportTicketId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne<TicketMessage>().WithMany().HasForeignKey(s => s.TicketMessageId)
                    .OnDelete(DeleteBehavior.SetNull);
                entity.HasOne<TicketSentimentJob>().WithMany().HasForeignKey(s => s.JobId)
                    .OnDelete(DeleteBehavior.Restrict);
                entity.HasIndex(s => s.JobId).IsUnique();
                entity.HasIndex(s => new { s.SupportTicketId, s.EventSequence }).IsUnique();
                entity.Property(s => s.AnalysisStage).HasMaxLength(20);
                entity.Property(s => s.SentimentLabel).HasMaxLength(10);
                entity.Property(s => s.ModelName).HasMaxLength(200);
                entity.Property(s => s.ModelRevision).HasMaxLength(100);
                entity.ToTable(table =>
                {
                    table.HasCheckConstraint("CK_TicketSentiments_Label", "\"SentimentLabel\" IN ('negative', 'neutral', 'positive')");
                    table.HasCheckConstraint("CK_TicketSentiments_Confidence", "\"Confidence\" >= 0 AND \"Confidence\" <= 1");
                });
            });
        }
    }
}
