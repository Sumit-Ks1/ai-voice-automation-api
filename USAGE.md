# Quick Start Guide

## Prerequisites

- Node.js 20+ LTS
- PostgreSQL (via Supabase)
- Redis (optional but recommended)
- Twilio account with phone number
- Ultravox.ai API access

## Installation

### 1. Clone and Install Dependencies

```bash
cd call_automation_script
npm install
```

### 2. Configure Environment

```bash
# Copy template
cp .env.example .env

# Edit with your credentials
notepad .env  # or your preferred editor
```

Required variables:
```env
# Twilio
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+1234567890

# Ultravox
ULTRAVOX_API_KEY=your_key
ULTRAVOX_API_URL=https://api.ultravox.ai/v1
ULTRAVOX_AGENT_ID=your_agent_id
ULTRAVOX_WEBHOOK_URL=https://your-domain.com/api/v1/webhooks/ultravox

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_key

# Security
API_KEY=generate_a_secure_random_key_here
```

### 3. Setup Database

1. Go to Supabase SQL Editor
2. Copy contents of `scripts/setup.sql`
3. Execute the SQL
4. Verify tables created: users, appointments, call_logs

### 4. Start Redis (Optional)

```bash
# Windows (with Chocolatey)
choco install redis
redis-server

# Or use Docker
docker run -d -p 6379:6379 redis:7-alpine

# Or disable Redis
# Set REDIS_ENABLED=false in .env
```

### 5. Build and Run

```bash
# Development (hot reload)
npm run dev

# Production build
npm run build
npm start
```

## Development Workflow

### Run Development Server

```bash
npm run dev
```

Server starts on `http://localhost:3000`

### Test Endpoints

```bash
# Health check
curl http://localhost:3000/health

# Should return:
{
  "status": "healthy",
  "timestamp": "2026-01-31T...",
  "services": {
    "database": "up",
    "redis": "up"
  }
}
```

### Local Testing with Ngrok

Twilio requires a public URL. Use ngrok for local testing:

```bash
# Install ngrok
choco install ngrok

# Start ngrok tunnel
ngrok http 3000

# Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
```

### Configure Twilio Webhook

1. Go to Twilio Console
2. Select your phone number
3. Under "Voice & Fax" -> "A Call Comes In"
4. Set URL to: `https://your-ngrok-url.ngrok.io/api/v1/twilio/inbound`
5. Method: HTTP POST
6. Save

### Configure Ultravox Webhook

Update your `.env`:
```env
ULTRAVOX_WEBHOOK_URL=https://your-ngrok-url.ngrok.io/api/v1/webhooks/ultravox
```

## Testing the System

### 1. Make a Test Call

1. Call your Twilio phone number
2. You should hear the AI agent greeting
3. Say: "I want to book an appointment"
4. Follow the AI prompts

### 2. Monitor Logs

Watch the console for structured logs:

```json
{
  "level": "info",
  "time": "2026-01-31T10:00:00.000Z",
  "correlationId": "uuid-here",
  "msg": "Inbound call received",
  "callSid": "CAxxxx",
  "from": "+1234567890"
}
```

### 3. Check Database

```sql
-- View users
SELECT * FROM users ORDER BY created_at DESC LIMIT 10;

-- View appointments
SELECT * FROM appointments ORDER BY created_at DESC LIMIT 10;

-- View call logs
SELECT * FROM call_logs ORDER BY created_at DESC LIMIT 10;
```

## Common Use Cases

### Creating an Appointment

**User Says**: "I want to schedule an appointment for tomorrow at 2 PM"

**AI Collects**:
- Patient name
- Phone number (validates against caller ID)
- Date: tomorrow
- Time: 2:00 PM
- Reason for visit

**System Validates**:
- Date is not in past ✓
- Time is within business hours ✓
- No conflicts ✓
- Creates appointment ✓

### Editing an Appointment

**User Says**: "I need to change my appointment to Friday at 3 PM"

**AI Collects**:
- Appointment ID (finds by phone number)
- New date: Friday
- New time: 3:00 PM

**System Validates**:
- Appointment exists ✓
- New time has no conflicts ✓
- Updates appointment ✓

### Cancelling an Appointment

**User Says**: "I need to cancel my appointment"

**AI Collects**:
- Appointment ID (finds by phone number)
- Optional cancellation reason

**System Validates**:
- Appointment exists ✓
- Not already cancelled ✓
- Cancels appointment ✓

### Checking Status

**User Says**: "Do I have any upcoming appointments?"

**System Returns**:
- Lists all scheduled/confirmed appointments
- Includes dates and times

## API Documentation

### POST /api/v1/twilio/inbound

Handles inbound call from Twilio.

**Request** (from Twilio):
```
Content-Type: application/x-www-form-urlencoded
X-Twilio-Signature: signature_here

CallSid=CAxxxx&From=+1234567890&To=+1987654321...
```

**Response** (TwiML):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://ultravox.ai/stream/session123">
      <Parameter name="callSid" value="CAxxxx" />
    </Stream>
  </Connect>
</Response>
```

### POST /api/v1/webhooks/ultravox

Handles callback from Ultravox AI agent.

**Request**:
```json
{
  "sessionId": "session123",
  "callSid": "CAxxxx",
  "status": "completed",
  "duration": 120,
  "intent": {
    "name": "book_appointment",
    "confidence": 0.95
  },
  "extractedData": {
    "appointmentType": "create",
    "appointmentDate": "2026-02-01",
    "appointmentTime": "14:00",
    "patientName": "John Doe",
    "patientPhone": "+1234567890",
    "reason": "Annual checkup"
  }
}
```

**Response**:
```json
{
  "status": "success",
  "result": {
    "intent": "create_appointment",
    "success": true,
    "message": "Appointment successfully scheduled for 2026-02-01 at 14:00"
  },
  "processingTime": 250
}
```

## Error Handling

### Business Hours Violation

```json
{
  "status": "error",
  "message": "Appointments must be scheduled during business hours: 09:00 - 17:00 America/New_York",
  "code": "BusinessRuleError"
}
```

### Time Conflict

```json
{
  "status": "error",
  "message": "Time slot conflicts with existing appointment(s): 2026-02-01 at 14:00",
  "code": "ConflictError",
  "errors": [{
    "conflicts": ["uuid-of-conflicting-appointment"]
  }]
}
```

### Past Date

```json
{
  "status": "error",
  "message": "Cannot schedule appointment in the past",
  "code": "BusinessRuleError"
}
```

## Production Deployment

### Environment Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use secure `API_KEY` (32+ characters)
- [ ] Enable `TWILIO_WEBHOOK_SIGNATURE_VALIDATION=true`
- [ ] Set production Supabase credentials
- [ ] Enable Redis (`REDIS_ENABLED=true`)
- [ ] Configure proper `BUSINESS_TIMEZONE`
- [ ] Set appropriate rate limits
- [ ] Disable pretty logging (`LOG_PRETTY=false`)

### Docker Deployment

```bash
# Build image
docker build -t ai-voice-api .

# Run container
docker run -d \
  -p 3000:3000 \
  --env-file .env \
  --name ai-voice-api \
  ai-voice-api

# With Docker Compose
docker-compose up -d
```

### PM2 Deployment

```bash
# Install PM2
npm install -g pm2

# Build
npm run build

# Start with PM2
pm2 start dist/server.js -i max --name ai-voice-api

# View logs
pm2 logs ai-voice-api

# Monitor
pm2 monit
```

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Monitoring

### Health Checks

```bash
# Basic health
curl http://localhost:3000/health

# Expected response
{
  "status": "healthy",
  "timestamp": "2026-01-31T...",
  "services": {
    "database": "up",
    "redis": "up"
  }
}
```

### Logs

Logs are output as structured JSON:

```json
{
  "level": "info",
  "time": "2026-01-31T10:00:00.000Z",
  "correlationId": "uuid",
  "service": "appointment",
  "appointmentId": "uuid",
  "userId": "uuid",
  "duration": 250,
  "msg": "Appointment created"
}
```

### Metrics to Monitor

1. **Call Volume**: Number of inbound calls
2. **Intent Accuracy**: Success rate of intent detection
3. **Appointment Creation Rate**: Calls that result in bookings
4. **Error Rate**: Failed requests
5. **Response Time**: P50, P95, P99 latencies
6. **Database Performance**: Query execution times

## Troubleshooting

### Server Won't Start

```bash
# Check Node version
node -v  # Should be 20+

# Check dependencies
npm install

# Check .env file
cat .env

# Check logs
npm run dev 2>&1 | tee server.log
```

### Twilio Webhook Returns Error

```bash
# Check signature validation
# Verify TWILIO_AUTH_TOKEN is correct
# Check URL is accessible from internet
# Review Twilio debugger in console
```

### Database Connection Failed

```bash
# Verify Supabase URL and keys
# Check network connectivity
# Run health check: curl http://localhost:3000/health
# Check Supabase dashboard for connection limits
```

### Redis Connection Failed

```bash
# Check if Redis is running
redis-cli ping  # Should return PONG

# Check REDIS_URL in .env
# Or disable: REDIS_ENABLED=false
```

### AI Agent Not Responding

```bash
# Verify Ultravox credentials
# Check ULTRAVOX_API_KEY and AGENT_ID
# Review Ultravox dashboard/logs
# Check WebSocket connection in network tab
```

## Support and Resources

- **Twilio Docs**: https://www.twilio.com/docs/voice
- **Supabase Docs**: https://supabase.com/docs
- **Redis Docs**: https://redis.io/docs
- **Pino Logger**: https://github.com/pinojs/pino
- **Zod Validation**: https://github.com/colinhacks/zod

## Next Steps

1. **Customize AI Prompt**: Edit `ultravox.service.ts` -> `buildSystemPrompt()`
2. **Add SMS Reminders**: Integrate Twilio SMS API
3. **Admin Dashboard**: Build UI for appointment management
4. **Multi-tenancy**: Support multiple clinics
5. **Analytics**: Track metrics and KPIs

## License

MIT
