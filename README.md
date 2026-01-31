# AI Voice Automation Platform

Production-grade AI voice automation system integrating Twilio Voice, Ultravox.ai, and Supabase for intelligent inbound call handling and appointment management.

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Twilio    │─────▶│    Express   │─────▶│  Ultravox   │
│   Inbound   │      │    Server    │      │  AI Agent   │
└─────────────┘      └──────────────┘      └─────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │   Supabase   │
                     │  PostgreSQL  │
                     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │    Redis     │
                     │ (Sessions)   │
                     └──────────────┘
```

## Features

- 🎯 **Intent-based routing**: Create, edit, cancel, fetch appointments
- 🔐 **User verification**: Phone + name validation
- ⚡ **Real-time processing**: WebSocket streaming with Twilio
- 🛡️ **Security hardened**: Webhook signature verification, rate limiting
- 📊 **Structured logging**: Correlation IDs, performance tracking
- 🔄 **Session management**: Redis-backed state persistence
- ⏰ **Business rules**: Hours validation, conflict detection, buffer times
- 🚀 **Horizontally scalable**: Stateless design with shared cache

## Tech Stack

- **Runtime**: Node.js 20+ (LTS)
- **Framework**: Express.js
- **Language**: TypeScript (strict mode)
- **Database**: Supabase (PostgreSQL)
- **Cache**: Redis
- **Validation**: Zod
- **Logging**: Pino
- **HTTP Client**: Axios

## Project Structure

```
src/
├── config/              # Configuration and environment
│   ├── env.ts
│   ├── logger.ts
│   ├── database.ts
│   └── redis.ts
├── types/               # TypeScript type definitions
│   ├── express.d.ts
│   ├── twilio.types.ts
│   ├── ultravox.types.ts
│   └── appointment.types.ts
├── schemas/             # Zod validation schemas
│   ├── appointment.schema.ts
│   ├── callback.schema.ts
│   └── user.schema.ts
├── repositories/        # Data access layer
│   ├── appointment.repository.ts
│   ├── user.repository.ts
│   └── call-log.repository.ts
├── services/            # Business logic layer
│   ├── twilio.service.ts
│   ├── ultravox.service.ts
│   ├── appointment.service.ts
│   ├── user.service.ts
│   └── intent.service.ts
├── controllers/         # HTTP request handlers
│   ├── twilio.controller.ts
│   └── webhook.controller.ts
├── routes/              # API route definitions
│   ├── twilio.routes.ts
│   └── webhook.routes.ts
├── middleware/          # Express middleware
│   ├── error.middleware.ts
│   ├── validation.middleware.ts
│   ├── auth.middleware.ts
│   └── request-logger.middleware.ts
├── utils/               # Utility functions
│   ├── errors.ts
│   ├── twiml.builder.ts
│   ├── date.utils.ts
│   └── phone.utils.ts
└── server.ts            # Application entry point
```

## Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
nano .env
```

## Database Setup

Run the following SQL in your Supabase SQL editor:

```sql
-- See scripts/setup.sql for complete schema
```

## Development

```bash
# Run in development mode with hot reload
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

## API Endpoints

### Twilio Webhooks
- `POST /api/v1/twilio/inbound` - Inbound call handler
- `POST /api/v1/twilio/status` - Call status callback

### Ultravox Callbacks
- `POST /api/v1/webhooks/ultravox` - AI agent callback handler

## Environment Variables

See [.env.example](.env.example) for all configuration options.

## Security Considerations

- ✅ Twilio webhook signature verification enabled
- ✅ Helmet.js security headers
- ✅ Rate limiting per IP
- ✅ Input validation with Zod
- ✅ No secrets in code or logs
- ✅ Database connection pooling
- ✅ Redis connection encryption support

## Performance Optimizations

- Connection pooling for database
- Redis for session caching
- Async/await throughout
- Pino logger (faster than Winston)
- Express compression middleware
- Horizontal scaling ready (stateless)

## Monitoring

- Structured JSON logs with correlation IDs
- Request/response timing
- Error stack traces with context
- Database query performance tracking

## Production Deployment

```bash
# Build
npm run build

# Set NODE_ENV
export NODE_ENV=production

# Start with PM2 (recommended)
pm2 start dist/server.js -i max --name ai-voice-api

# Or with Docker
docker build -t ai-voice-api .
docker run -p 3000:3000 --env-file .env ai-voice-api
```

## License

MIT
