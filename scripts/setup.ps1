# Development Setup Script
# Run this to set up your development environment

Write-Host "🚀 Setting up AI Voice Automation development environment..." -ForegroundColor Cyan

# Check Node.js version
Write-Host "`n📦 Checking Node.js version..." -ForegroundColor Yellow
$nodeVersion = node -v
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Node.js version: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "✗ Node.js not found. Please install Node.js 20 or higher." -ForegroundColor Red
    exit 1
}

# Install dependencies
Write-Host "`n📦 Installing dependencies..." -ForegroundColor Yellow
npm install

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to install dependencies" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Dependencies installed successfully" -ForegroundColor Green

# Check for .env file
Write-Host "`n🔧 Checking environment configuration..." -ForegroundColor Yellow
if (Test-Path ".env") {
    Write-Host "✓ .env file found" -ForegroundColor Green
} else {
    Write-Host "⚠ .env file not found. Creating from template..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "✓ Created .env file. Please update with your credentials." -ForegroundColor Green
}

# Check Redis (optional)
Write-Host "`n🔴 Checking Redis..." -ForegroundColor Yellow
try {
    $redisTest = redis-cli ping 2>&1
    if ($redisTest -eq "PONG") {
        Write-Host "✓ Redis is running" -ForegroundColor Green
    } else {
        Write-Host "⚠ Redis not responding. Install Redis or disable in .env" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠ Redis not installed. Install Redis or set REDIS_ENABLED=false in .env" -ForegroundColor Yellow
}

# Build TypeScript
Write-Host "`n🔨 Building TypeScript..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ TypeScript build failed" -ForegroundColor Red
    exit 1
}
Write-Host "✓ TypeScript build successful" -ForegroundColor Green

Write-Host "`n✅ Setup complete!" -ForegroundColor Green
Write-Host "`n📋 Next steps:" -ForegroundColor Cyan
Write-Host "  1. Update .env file with your credentials" -ForegroundColor White
Write-Host "  2. Run the database setup SQL in Supabase (scripts/setup.sql)" -ForegroundColor White
Write-Host "  3. Start development server: npm run dev" -ForegroundColor White
Write-Host "  4. Configure Twilio webhook URL: https://your-domain.com/api/v1/twilio/inbound" -ForegroundColor White
Write-Host "`n🎉 Happy coding!" -ForegroundColor Cyan
