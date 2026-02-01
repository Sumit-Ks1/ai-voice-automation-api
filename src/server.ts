/**
 * Express server bootstrap
 * Main application entry point with production-ready configuration
 */

import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config, isDevelopment } from './config/env';
import logger from './config/logger';
import { getRedisClient, closeRedis, checkRedisHealth } from './config/redis';
import { closeDatabase, checkDatabaseHealth } from './config/database';
import {
  errorHandler,
  notFoundHandler,
  handleUnhandledRejection,
  handleUncaughtException,
} from './middleware/error.middleware';
import { correlationId, requestLogger, logRequestBody } from './middleware/request-logger.middleware';
import twilioRoutes from './routes/twilio.routes';
import webhookRoutes from './routes/webhook.routes';

/**
 * Create and configure Express application
 */
function createApp(): Application {
  const app = express();

  // Trust proxy (required for rate limiting behind load balancer)
  app.set('trust proxy', 1);

  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: false, // Not needed for API
      crossOriginEmbedderPolicy: false,
    })
  );

  // CORS configuration
  app.use(
    cors({
      origin: isDevelopment ? '*' : config.ULTRAVOX_WEBHOOK_URL,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Correlation-ID'],
      exposedHeaders: ['X-Correlation-ID'],
    })
  );

  // Rate limiting
  const limiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    max: config.RATE_LIMIT_MAX_REQUESTS,
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    // Skip rate limiting for health checks
    skip: (req) => req.path === '/api/v1/webhooks/health',
  });

  app.use(limiter);

  // Body parsing middleware
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Request tracking and logging
  app.use(correlationId);
  app.use(requestLogger);

  if (isDevelopment) {
    app.use(logRequestBody);
  }

  // API Routes
  app.use('/api/v1/twilio', twilioRoutes);
  app.use('/api/v1/webhooks', webhookRoutes);

  // Root health check
  app.get('/', (_req, res) => {
    res.json({
      name: 'AI Voice Automation API',
      version: '1.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
    });
  });

  // Detailed health check - always return 200 to pass Railway healthcheck
  // In degraded state, the API can still handle requests (gracefully degraded)
  app.get('/health', async (_req, res) => {
    const dbHealthy = await checkDatabaseHealth();
    const redisHealthy = config.REDIS_ENABLED ? await checkRedisHealth() : true;

    const health = {
      status: dbHealthy && redisHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: dbHealthy ? 'up' : 'down',
        redis: config.REDIS_ENABLED ? (redisHealthy ? 'up' : 'down') : 'disabled',
      },
    };

    // Always return 200 - the API can run in degraded mode
    res.status(200).json(health);
  });

  // Diagnostic endpoint to test configuration
  app.get('/debug/config', (_req, res) => {
    res.json({
      timestamp: new Date().toISOString(),
      environment: config.NODE_ENV,
      ultravox: {
        apiUrl: config.ULTRAVOX_API_URL,
        agentId: config.ULTRAVOX_AGENT_ID ? `${config.ULTRAVOX_AGENT_ID.substring(0, 8)}...` : 'NOT SET',
        webhookUrl: config.ULTRAVOX_WEBHOOK_URL,
      },
      twilio: {
        accountSid: config.TWILIO_ACCOUNT_SID ? `${config.TWILIO_ACCOUNT_SID.substring(0, 8)}...` : 'NOT SET',
        phoneNumber: config.TWILIO_PHONE_NUMBER,
        signatureValidation: config.TWILIO_WEBHOOK_SIGNATURE_VALIDATION,
      },
      supabase: {
        url: config.SUPABASE_URL,
        hasAnonKey: !!config.SUPABASE_ANON_KEY,
        hasServiceKey: !!config.SUPABASE_SERVICE_ROLE_KEY,
      },
      redis: {
        enabled: config.REDIS_ENABLED,
      },
    });
  });

  // 404 handler (must be after all routes)
  app.use(notFoundHandler);

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}

/**
 * Start the server
 */
async function startServer(): Promise<void> {
  try {
    logger.info('Starting AI Voice Automation server...');

    // Register process error handlers
    handleUnhandledRejection();
    handleUncaughtException();

    // Initialize Redis if enabled
    if (config.REDIS_ENABLED) {
      try {
        await getRedisClient();
        logger.info('Redis connection established');
      } catch (error) {
        logger.warn('Redis connection failed, continuing without cache');
      }
    }

    // Create Express app
    const app = createApp();

    // Start HTTP server
    const server = app.listen(config.PORT, config.HOST, () => {
      logger.info(
        {
          host: config.HOST,
          port: config.PORT,
          env: config.NODE_ENV,
        },
        `Server is running on http://${config.HOST}:${config.PORT}`
      );

      logger.info('API endpoints:');
      logger.info(`  POST http://${config.HOST}:${config.PORT}/api/v1/twilio/inbound`);
      logger.info(`  POST http://${config.HOST}:${config.PORT}/api/v1/twilio/status`);
      logger.info(`  POST http://${config.HOST}:${config.PORT}/api/v1/webhooks/ultravox`);
      logger.info(`  GET  http://${config.HOST}:${config.PORT}/api/v1/webhooks/health`);
    });

    // Graceful shutdown handler
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown`);

      // Stop accepting new connections
      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          // Close database connection
          await closeDatabase();
          logger.info('Database connection closed');

          // Close Redis connection
          if (config.REDIS_ENABLED) {
            await closeRedis();
            logger.info('Redis connection closed');
          }

          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error({ err: error }, 'Error during graceful shutdown');
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forceful shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  startServer().catch((error) => {
    logger.fatal({ err: error }, 'Unhandled error during startup');
    process.exit(1);
  });
}

export { createApp, startServer };
