
using System.Text;
using BankingAPI.Data;
using BankingAPI.Models;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using BankingAPI.Services;
using BankingAPI.Services.AI;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendPolicy", policy =>
    {
        policy
            .WithOrigins("http://localhost:3000")
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var connectionString = builder.Configuration
    .GetConnectionString("DefaultConnection");

builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseNpgsql(connectionString));

builder.Services
    .AddIdentityCore<ApplicationUser>(options =>
    {
        options.Password.RequiredLength = 12;
        options.Password.RequireDigit = true;
        options.Password.RequireUppercase = true;
        options.Password.RequireLowercase = true;
        options.Password.RequireNonAlphanumeric = true;

        options.User.RequireUniqueEmail = true;

        options.Lockout.DefaultLockoutTimeSpan =
            TimeSpan.FromMinutes(15);
        options.Lockout.MaxFailedAccessAttempts = 5;
        options.Lockout.AllowedForNewUsers = true;
    })
    .AddRoles<IdentityRole<int>>()
    .AddEntityFrameworkStores<ApplicationDbContext>()
    .AddSignInManager()
    .AddDefaultTokenProviders();

var jwtKey = builder.Configuration["Jwt:Key"]
    ?? throw new InvalidOperationException("JWT key is missing.");

var jwtIssuer = builder.Configuration["Jwt:Issuer"]!;
var jwtAudience = builder.Configuration["Jwt:Audience"]!;

builder.Services
    .AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme =
            JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme =
            JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(jwtKey)),
            
            ValidateIssuer = true,
            ValidIssuer = jwtIssuer,
            
            ValidateAudience = true,
            ValidAudience = jwtAudience,
            
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1)
        };
        
        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = async context =>
            {
                var userManager = context.HttpContext.RequestServices
                .GetRequiredService<UserManager<ApplicationUser>>();
                
                var userId = context.Principal?
                .FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?
                .Value;
                
                if (!int.TryParse(userId, out var id))
                {
                    context.Fail("Invalid user identity.");
                    return;
                }

                var user = await userManager.FindByIdAsync(id.ToString());

                if (user == null || !user.IsActive)
                {
                    context.Fail("User account is inactive or unavailable.");
                }
            }
        };
    });


builder.Services.AddAuthorization();
builder.Services.AddDataProtection();
builder.Services.AddOpenApi();
builder.Services.AddScoped<AuditLogService>();
builder.Services.AddScoped<NotificationService>();
builder.Services.Configure<AiServiceOptions>(
    builder.Configuration.GetSection(AiServiceOptions.SectionName));
builder.Services.PostConfigure<AiServiceOptions>(options =>
{
    options.InternalServiceKey = builder.Configuration["INTERNAL_SERVICE_KEY"]
        ?? options.InternalServiceKey;
});
builder.Services.AddHttpClient<IAiTicketService, AiTicketService>((services, client) =>
{
    var options = services.GetRequiredService<IOptions<AiServiceOptions>>().Value;
    if (Uri.TryCreate(options.BaseUrl, UriKind.Absolute, out var baseUri) &&
        (baseUri.Scheme == Uri.UriSchemeHttp || baseUri.Scheme == Uri.UriSchemeHttps))
    {
        client.BaseAddress = new Uri(options.BaseUrl.EndsWith('/')
            ? options.BaseUrl
            : options.BaseUrl + "/");
    }

    client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds is >= 1 and <= 180
        ? options.TimeoutSeconds
        : 75);
}).RedactLoggedHeaders(["Authorization"]);

builder.Services.AddControllers();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseCors("FrontendPolicy");

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/db-test", async (ApplicationDbContext db) =>
{
    var connected = await db.Database.CanConnectAsync();

    return connected
        ? Results.Ok("Connected to Neon PostgreSQL!")
        : Results.Problem("Could not connect to Neon.");
});

app.MapControllers();


using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;

    var roleManager = services
        .GetRequiredService<RoleManager<IdentityRole<int>>>();

    var userManager = services
        .GetRequiredService<UserManager<ApplicationUser>>();

    var db = services
        .GetRequiredService<ApplicationDbContext>();
        

    await RoleSeeder.SeedAsync(roleManager, userManager);
    await AdminSeeder.SeedAsync(userManager, app.Configuration);
    await DbSeeder.SeedAsync(db);
}

app.Run();
