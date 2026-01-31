# Free Deployment Options

Get a free public HTTPS URL for your AI Voice Automation API.

---

## Option 1: Railway (Recommended - Easiest)

**Free Tier**: $5 credit/month, no credit card required

### Steps:

1. **Sign up** at https://railway.app (use GitHub)

2. **Create new project** → "Deploy from GitHub repo"

3. **Connect your repo** or use "Deploy from local":
   ```bash
   # Install Railway CLI
   npm install -g @railway/cli
   
   # Login
   railway login
   
   # Initialize and deploy
   railway init
   railway up
   ```

4. **Add environment variables** in Railway dashboard:
   - Go to your service → Variables
   - Add all variables from `.env.example`

5. **Get your URL**:
   - Railway auto-generates: `https://your-app.up.railway.app`
   - Or add custom domain in Settings

### Quick Deploy Command:
```bash
railway login
railway init -n ai-voice-automation
railway up
```

---

## Option 2: Render.com

**Free Tier**: 750 hours/month, auto-sleep after 15 min inactivity

### Steps:

1. **Sign up** at https://render.com

2. **New** → **Web Service** → Connect GitHub repo

3. **Configure**:
   - Runtime: Docker
   - Plan: Free
   - Add environment variables

4. **Deploy** - Render auto-detects Dockerfile

5. **URL**: `https://your-app.onrender.com`

### One-click Deploy:
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

---

## Option 3: Fly.io

**Free Tier**: 3 shared VMs, 160GB bandwidth

### Steps:

1. **Install Fly CLI**:
   ```bash
   # Windows (PowerShell as Admin)
   powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
   ```

2. **Sign up and login**:
   ```bash
   fly auth signup
   # or
   fly auth login
   ```

3. **Deploy**:
   ```bash
   fly launch --name ai-voice-automation
   ```

4. **Set secrets** (environment variables):
   ```bash
   fly secrets set TWILIO_ACCOUNT_SID=ACxxxxx
   fly secrets set TWILIO_AUTH_TOKEN=xxxxx
   fly secrets set ULTRAVOX_API_KEY=xxxxx
   fly secrets set SUPABASE_URL=https://xxx.supabase.co
   fly secrets set SUPABASE_SERVICE_ROLE_KEY=xxxxx
   fly secrets set API_KEY=your-api-key-here
   # Add all other required env vars
   ```

5. **Deploy**:
   ```bash
   fly deploy
   ```

6. **URL**: `https://ai-voice-automation.fly.dev`

---

## Option 4: Koyeb

**Free Tier**: 1 nano instance, always free

### Steps:

1. **Sign up** at https://koyeb.com

2. **Create App** → Docker → Connect GitHub

3. **Configure** environment variables

4. **Deploy**

5. **URL**: `https://your-app.koyeb.app`

---

## After Deployment

### 1. Update Twilio Webhook URLs

In Twilio Console → Phone Numbers → Your Number:

```
Voice Webhook URL: https://YOUR-APP-URL/api/v1/twilio/inbound
Status Callback:   https://YOUR-APP-URL/api/v1/twilio/status
```

### 2. Update Ultravox Callback URL

In your `.env` or platform's environment variables:

```
ULTRAVOX_WEBHOOK_URL=https://YOUR-APP-URL/api/v1/webhooks/ultravox
```

### 3. Test Endpoints

```bash
# Health check
curl https://YOUR-APP-URL/health

# Root endpoint
curl https://YOUR-APP-URL/

# Test webhook endpoint (should return 401 without proper auth)
curl -X POST https://YOUR-APP-URL/api/v1/webhooks/ultravox
```

---

## Environment Variables Checklist

Make sure to set ALL these in your deployment platform:

```env
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Twilio (from twilio.com/console)
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_WEBHOOK_SIGNATURE_VALIDATION=true

# Ultravox (from ultravox.ai dashboard)
ULTRAVOX_API_KEY=xxxxx
ULTRAVOX_API_URL=https://api.ultravox.ai/v1
ULTRAVOX_AGENT_ID=xxxxx
ULTRAVOX_WEBHOOK_URL=https://YOUR-DEPLOYED-URL/api/v1/webhooks/ultravox

# Supabase (from supabase.com dashboard)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=xxxxx
SUPABASE_SERVICE_ROLE_KEY=xxxxx

# Redis (optional - disable if not using)
REDIS_ENABLED=false

# Security
API_KEY=generate-a-strong-random-key-here

# Business Config
BUSINESS_TIMEZONE=America/New_York
BUSINESS_HOURS_START=09:00
BUSINESS_HOURS_END=17:00
APPOINTMENT_DURATION_MINUTES=30
```

---

## Troubleshooting

### Container won't start
- Check logs in platform dashboard
- Ensure all required env vars are set
- Verify Supabase connection

### Webhooks failing
- Check Twilio webhook signature validation
- Verify URLs are correct
- Check logs for errors

### Database errors
- Run `scripts/setup.sql` in Supabase
- Verify service role key is correct

---

## Quick Start: Railway (Fastest)

```bash
# 1. Install CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Deploy
railway init -n ai-voice-api
railway up

# 4. Add env vars in dashboard
# 5. Get URL from dashboard
```

Your public URL will be: `https://ai-voice-api-production.up.railway.app`
