using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BankingAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddApplicationReviewDetails : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ReviewReason",
                table: "ProductApplications",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ReviewedBy",
                table: "ProductApplications",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReviewReason",
                table: "KycDocuments",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ProductApplications_ReviewedBy",
                table: "ProductApplications",
                column: "ReviewedBy");

            migrationBuilder.AddForeignKey(
                name: "FK_ProductApplications_AspNetUsers_ReviewedBy",
                table: "ProductApplications",
                column: "ReviewedBy",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ProductApplications_AspNetUsers_ReviewedBy",
                table: "ProductApplications");

            migrationBuilder.DropIndex(
                name: "IX_ProductApplications_ReviewedBy",
                table: "ProductApplications");

            migrationBuilder.DropColumn(
                name: "ReviewReason",
                table: "ProductApplications");

            migrationBuilder.DropColumn(
                name: "ReviewedBy",
                table: "ProductApplications");

            migrationBuilder.DropColumn(
                name: "ReviewReason",
                table: "KycDocuments");
        }
    }
}
