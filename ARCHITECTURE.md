# Architecture Documentation

## System Overview

This is a production-grade AI voice automation platform that replaces n8n workflows for handling inbound calls and appointment management. The system integrates:

- **Twilio Voice**: Handles inbound calls and telephony
- **Ultravox.ai**: Provides AI voice agent capabilities
- **Supabase/PostgreSQL**: Stores appointments and user data
- **Redis**: Caches session state and rate limiting

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         INBOUND CALL FLOW                        │
└─────────────────────────────────────────────────────────────────┘

1. Caller ──[PSTN]──> Twilio Phone Number
                            │
                            ▼
2. Twilio ──[POST /api/v1/twilio/inbound]──> Express Server
                            │
                            ├──> Verify Signature (Security)
                            ├──> Find/Create User (Database)
                            ├──> Create Call Log (Audit)
                            │
3. Express ──[API Call]──> Ultravox.ai
                            │
                            ▼
4. Ultravox Returns WebSocket URL
                            │
                            ▼
5. Express ──[TwiML XML]──> Twilio
                            │
                            ▼
6. Twilio Connects to Ultravox WebSocket
                            │
                            ▼
7. AI Agent Converses with Caller
                            │
                            ▼
8. Ultravox ──[POST /api/v1/webhooks/ultravox]──> Express Server
                            │
                            ├──> Parse Intent (AI Processing)
                            ├──> Execute Business Logic
                            ├──> Create/Update/Cancel Appointment
                            └──> Update Call Log
```

## Component Architecture

### 1. Configuration Layer (`src/config/`)

**Purpose**: Centralized configuration and external service clients

- `env.ts`: Environment variable validation using Zod
- `logger.ts`: Pino logger with structured logging
- `database.ts`: Supabase client singleton
- `redis.ts`: Redis client with automatic reconnection

**Key Features**:
- Strict environment validation at startup
- Connection pooling for database
- Graceful degradation if Redis unavailable
- Health check functions

### 2. Types Layer (`src/types/`)

**Purpose**: TypeScript type definitions for type safety

- `twilio.types.ts`: Twilio webhook payloads
- `ultravox.types.ts`: Ultravox API contracts
- `appointment.types.ts`: Domain models
- `express.d.ts`: Extended Express types

### 3. Validation Layer (`src/schemas/`)

**Purpose**: Runtime validation using Zod schemas

- `appointment.schema.ts`: Appointment CRUD validation
- `callback.schema.ts`: AI callback validation
- `user.schema.ts`: User operation validation

**Why Zod?**
- Runtime type checking
- Automatic type inference
- Better error messages than Joi
- Lighter than class-validator

### 4. Repository Layer (`src/repositories/`)

**Purpose**: Database abstraction and data access

- `user.repository.ts`: User CRUD operations
- `appointment.repository.ts`: Appointment CRUD + conflict detection
- `call-log.repository.ts`: Call tracking and analytics

**Key Features**:
- Abstracts Supabase queries
- Handles database errors consistently
- Optimized queries with proper indexes
- Transaction support where needed

### 5. Service Layer (`src/services/`)

**Purpose**: Business logic and external API interactions

- `appointment.service.ts`: Business rules, validation, conflict detection
- `user.service.ts`: User verification and management
- `intent.service.ts`: AI callback processing and routing
- `twilio.service.ts`: Twilio webhook validation
- `ultravox.service.ts`: AI agent session management

**Key Features**:
- Business rule enforcement
- Edge case handling
- Service-to-service communication
- Complex workflows

### 6. Controller Layer (`src/controllers/`)

**Purpose**: HTTP request/response handling

- `twilio.controller.ts`: Twilio webhook handlers
- `webhook.controller.ts`: Ultravox callback handler

**Responsibilities**:
- Request parsing
- Response formatting
- Error handling delegation
- Correlation ID tracking

### 7. Middleware Layer (`src/middleware/`)

**Purpose**: Cross-cutting concerns

- `error.middleware.ts`: Centralized error handling
- `validation.middleware.ts`: Request validation
- `auth.middleware.ts`: Authentication (Twilio signature, API keys)
- `request-logger.middleware.ts`: Request/response logging

### 8. Routes Layer (`src/routes/`)

**Purpose**: API endpoint definitions

- `twilio.routes.ts`: `/api/v1/twilio/*`
- `webhook.routes.ts`: `/api/v1/webhooks/*`

### 9. Utilities (`src/utils/`)

**Purpose**: Reusable helper functions

- `errors.ts`: Custom error classes
- `twiml.builder.ts`: TwiML XML generation
- `date.utils.ts`: Date/time manipulation
- `phone.utils.ts`: Phone number formatting

## Data Flow

### Creating an Appointment

```
1. Caller makes inbound call
2. Twilio hits /api/v1/twilio/inbound
3. System verifies signature
4. System finds/creates user
5. System starts Ultravox session
6. System returns TwiML with WebSocket URL
7. Twilio connects to Ultravox
8. AI agent collects: name, date, time, reason
9. Ultravox calls /api/v1/webhooks/ultravox with structured data
10. System validates:
    - Date is not in past
    - Time is within business hours
    - No scheduling conflicts
11. System creates appointment in database
12. System updates call log
13. System returns success to Ultravox
```

### Edge Cases Handled

#### 1. **Past Date/Time**
```typescript
if (isPastDateTime(date, time)) {
  throw new BusinessRuleError('Cannot schedule in the past');
}
```

#### 2. **Outside Business Hours**
```typescript
if (!isWithinBusinessHours(date, time)) {
  throw new BusinessRuleError('Must be during business hours');
}
```

#### 3. **Time Conflicts**
```typescript
const conflicts = await findConflicts(startTime, endTime);
if (conflicts.length > 0) {
  throw new ConflictError('Time slot already booked');
}
```

#### 4. **Duplicate Appointments**
```typescript
// Handled by conflict detection with buffer time
const bufferedStart = addMinutes(startTime, -bufferMinutes);
const bufferedEnd = addMinutes(endTime, bufferMinutes);
```

#### 5. **Invalid Status Transitions**
```typescript
const validTransitions = {
  scheduled: ['confirmed', 'cancelled'],
  completed: [], // Cannot change completed
};
```

## Security Measures

### 1. **Twilio Webhook Verification**
```typescript
validateRequest(authToken, signature, url, params);
```

### 2. **Rate Limiting**
- 100 requests per 15 minutes per IP
- Configurable via environment

### 3. **Input Validation**
- All inputs validated with Zod
- SQL injection prevented by parameterized queries
- XSS prevented by not rendering user input

### 4. **CORS Configuration**
- Restricted origins in production
- Only necessary headers allowed

### 5. **Helmet Security Headers**
```typescript
helmet({
  contentSecurityPolicy: true,
  crossOriginEmbedderPolicy: true,
})
```

## Performance Optimizations

### 1. **Connection Pooling**
- Supabase maintains connection pool
- Redis connection reused

### 2. **Database Indexes**
```sql
CREATE INDEX idx_appointments_time_range 
  ON appointments(start_time_utc, end_time_utc);
```

### 3. **Redis Caching**
- Session data cached for 1 hour
- Reduces database queries

### 4. **Async/Await Throughout**
- No blocking operations
- Non-critical updates don't block responses

### 5. **Efficient Conflict Detection**
```typescript
// Single query with time range overlap
.or(`start_time_utc.lte.${end},end_time_utc.gte.${start}`)
```

## Horizontal Scaling

The application is designed to scale horizontally:

1. **Stateless Design**: No in-memory session state
2. **Shared Redis**: All instances share cache
3. **Connection Pooling**: Database connections managed
4. **Load Balancer Ready**: Trust proxy headers
5. **Health Checks**: `/health` endpoint for monitoring

## Monitoring and Observability

### 1. **Structured Logging**
```typescript
logger.info({
  correlationId,
  userId,
  appointmentId,
  duration
}, 'Appointment created');
```

### 2. **Correlation IDs**
- Tracks requests across services
- Included in all logs
- Returned in response headers

### 3. **Performance Tracking**
```typescript
const startTime = Date.now();
// ... operation ...
const duration = Date.now() - startTime;
logPerformance('create_appointment', duration);
```

### 4. **Error Context**
```typescript
throw new ConflictError('Time conflict', {
  requestedTime: time,
  conflictingAppointments: conflicts.map(a => a.id)
});
```

## Error Handling Strategy

### 1. **Error Hierarchy**
```
AppError (base)
├── ValidationError (400)
├── AuthenticationError (401)
├── AuthorizationError (403)
├── NotFoundError (404)
├── ConflictError (409)
├── BusinessRuleError (422)
├── RateLimitError (429)
└── ExternalServiceError (502)
```

### 2. **Operational vs Programming Errors**
```typescript
if (isOperationalError(error)) {
  // Expected error - return to client
} else {
  // Programming error - log and crash
}
```

### 3. **Graceful Degradation**
```typescript
// Redis failure doesn't crash app
try {
  await setCache(key, value);
} catch {
  logger.warn('Cache unavailable, continuing...');
}
```

## Testing Strategy (Framework Provided)

### 1. **Unit Tests**
- Services: Business logic
- Utils: Pure functions
- Repositories: Mock Supabase

### 2. **Integration Tests**
- Controllers: Full request/response
- Middleware: Authentication, validation

### 3. **E2E Tests**
- Full webhook flow
- Mock Twilio and Ultravox

## Deployment

### Development
```bash
npm run dev  # Hot reload with tsx
```

### Production
```bash
npm run build  # Compile TypeScript
npm start      # Run compiled code
```

### Docker
```bash
docker-compose up  # With Redis
```

### Environment Variables
See `.env.example` for all required configuration.

## API Endpoints

### Twilio Webhooks
```
POST /api/v1/twilio/inbound   - Inbound call handler
POST /api/v1/twilio/status    - Call status callback
```

### Ultravox Webhooks
```
POST /api/v1/webhooks/ultravox  - AI agent callback
```

### Health Checks
```
GET /                           - Basic status
GET /health                     - Detailed health check
GET /api/v1/webhooks/health     - Webhook health
```

## Future Enhancements

1. **Metrics**: Prometheus metrics endpoint
2. **Tracing**: OpenTelemetry integration
3. **SMS**: Appointment reminders via Twilio SMS
4. **Multi-tenancy**: Support multiple clinics
5. **Admin API**: CRUD endpoints for appointments
6. **Webhooks**: Outbound webhooks for integrations
7. **Analytics**: Call duration, intent accuracy
8. **A/B Testing**: Different AI prompts

## Troubleshooting

### Database Connection Issues
```bash
# Check Supabase URL and keys
# Verify network connectivity
# Check Supabase dashboard for errors
```

### Redis Connection Issues
```bash
# Verify Redis is running: redis-cli ping
# Check REDIS_URL in .env
# Disable Redis: REDIS_ENABLED=false
```

### Twilio Webhook Failures
```bash
# Check signature validation is enabled
# Verify TWILIO_AUTH_TOKEN is correct
# Use ngrok for local testing
```

### Performance Issues
```bash
# Check database indexes
# Monitor query performance in Supabase
# Enable Redis caching
# Check Pino logs for slow operations
```

## Support

For issues or questions, check:
- Logs: Structured JSON logs in `logs/` directory
- Health check: `GET /health`
- Supabase dashboard: Database queries and errors
- Twilio console: Call logs and debugging
