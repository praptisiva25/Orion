using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace BankingAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddTicketSentimentHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "SentimentEventSequence",
                table: "SupportTickets",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.CreateTable(
                name: "TicketSentimentJobs",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    SupportTicketId = table.Column<int>(type: "integer", nullable: false),
                    TicketMessageId = table.Column<int>(type: "integer", nullable: true),
                    EventSequence = table.Column<long>(type: "bigint", nullable: false),
                    AnalysisStage = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    NextAttemptAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LeaseExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LeaseToken = table.Column<Guid>(type: "uuid", nullable: true),
                    LastFailureCategory = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TicketSentimentJobs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TicketSentimentJobs_SupportTickets_SupportTicketId",
                        column: x => x.SupportTicketId,
                        principalTable: "SupportTickets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TicketSentimentJobs_TicketMessages_TicketMessageId",
                        column: x => x.TicketMessageId,
                        principalTable: "TicketMessages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "TicketSentiments",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    SupportTicketId = table.Column<int>(type: "integer", nullable: false),
                    TicketMessageId = table.Column<int>(type: "integer", nullable: true),
                    JobId = table.Column<long>(type: "bigint", nullable: false),
                    EventSequence = table.Column<long>(type: "bigint", nullable: false),
                    AnalysisStage = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    SentimentLabel = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    Confidence = table.Column<double>(type: "double precision", nullable: false),
                    ModelName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ModelRevision = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    AnalyzedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TicketSentiments", x => x.Id);
                    table.CheckConstraint("CK_TicketSentiments_Confidence", "\"Confidence\" >= 0 AND \"Confidence\" <= 1");
                    table.CheckConstraint("CK_TicketSentiments_Label", "\"SentimentLabel\" IN ('negative', 'neutral', 'positive')");
                    table.ForeignKey(
                        name: "FK_TicketSentiments_SupportTickets_SupportTicketId",
                        column: x => x.SupportTicketId,
                        principalTable: "SupportTickets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TicketSentiments_TicketMessages_TicketMessageId",
                        column: x => x.TicketMessageId,
                        principalTable: "TicketMessages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_TicketSentiments_TicketSentimentJobs_JobId",
                        column: x => x.JobId,
                        principalTable: "TicketSentimentJobs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TicketSentimentJobs_Status_NextAttemptAt_CreatedAt",
                table: "TicketSentimentJobs",
                columns: new[] { "Status", "NextAttemptAt", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_TicketSentimentJobs_SupportTicketId_EventSequence",
                table: "TicketSentimentJobs",
                columns: new[] { "SupportTicketId", "EventSequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TicketSentimentJobs_TicketMessageId",
                table: "TicketSentimentJobs",
                column: "TicketMessageId");

            migrationBuilder.CreateIndex(
                name: "IX_TicketSentiments_JobId",
                table: "TicketSentiments",
                column: "JobId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TicketSentiments_SupportTicketId_EventSequence",
                table: "TicketSentiments",
                columns: new[] { "SupportTicketId", "EventSequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TicketSentiments_TicketMessageId",
                table: "TicketSentiments",
                column: "TicketMessageId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TicketSentiments");

            migrationBuilder.DropTable(
                name: "TicketSentimentJobs");

            migrationBuilder.DropColumn(
                name: "SentimentEventSequence",
                table: "SupportTickets");
        }
    }
}
