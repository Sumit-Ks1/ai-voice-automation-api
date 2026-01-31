import { createClient, RedisClientType } from 'redis';
import { config } from './env';
import logger from './logger';

/**
 * Redis client singleton for session and cache management
 * Used for storing call session state, rate limiting, and temporary data
 */
let redisClient: RedisClientType | null = null;
let isConnected = false;

/**
 * Initialize Redis client with automatic reconnection
 */
export async function getRedisClient(): Promise<RedisClientType> {
  if (!config.REDIS_ENABLED) {
    throw new Error('Redis is disabled in configuration');
  }

  if (redisClient && isConnected) {
    return redisClient;
  }

  try {
    redisClient = createClient({
      url: config.REDIS_URL,
      password: config.REDIS_PASSWORD || undefined,
      database: config.REDIS_DB,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error('Redis max reconnection attempts reached');
            return new Error('Max reconnection attempts reached');
          }
          // Exponential backoff: 50ms, 100ms, 200ms, 400ms, 800ms, 1600ms...
          const delay = Math.min(50 * Math.pow(2, retries), 3000);
          logger.warn({ retries, delay }, 'Reconnecting to Redis');
          return delay;
        },
      },
    });

    // Event handlers
    redisClient.on('error', (err) => {
      logger.error({ err }, 'Redis client error');
      isConnected = false;
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected');
      isConnected = true;
    });

    redisClient.on('reconnecting', () => {
      logger.warn('Redis client reconnecting');
      isConnected = false;
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
      isConnected = true;
    });

    await redisClient.connect();

    return redisClient;
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize Redis client');
    throw error;
  }
}

/**
 * Close Redis connection gracefully
 */
export async function closeRedis(): Promise<void> {
  if (redisClient && isConnected) {
    try {
      await redisClient.quit();
      isConnected = false;
      redisClient = null;
      logger.info('Redis client disconnected');
    } catch (error) {
      logger.error({ err: error }, 'Error closing Redis connection');
      // Force disconnect on error
      if (redisClient) {
        await redisClient.disconnect();
      }
      isConnected = false;
      redisClient = null;
    }
  }
}

/**
 * Check if Redis is connected and operational
 */
export async function checkRedisHealth(): Promise<boolean> {
  try {
    if (!config.REDIS_ENABLED) {
      return true; // Not required, so healthy by default
    }

    const client = await getRedisClient();
    await client.ping();
    return true;
  } catch (error) {
    logger.error({ err: error }, 'Redis health check failed');
    return false;
  }
}

/**
 * Cache helper functions
 */
export async function setCache(
  key: string,
  value: string | object,
  ttlSeconds?: number
): Promise<void> {
  try {
    const client = await getRedisClient();
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;

    if (ttlSeconds) {
      await client.setEx(key, ttlSeconds, stringValue);
    } else {
      await client.set(key, stringValue);
    }
  } catch (error) {
    logger.error({ err: error, key }, 'Failed to set cache');
    throw error;
  }
}

export async function getCache<T = string>(key: string): Promise<T | null> {
  try {
    const client = await getRedisClient();
    const value = await client.get(key);

    if (!value) {
      return null;
    }

    // Try to parse as JSON, fallback to string
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  } catch (error) {
    logger.error({ err: error, key }, 'Failed to get cache');
    throw error;
  }
}

export async function deleteCache(key: string): Promise<void> {
  try {
    const client = await getRedisClient();
    await client.del(key);
  } catch (error) {
    logger.error({ err: error, key }, 'Failed to delete cache');
    throw error;
  }
}

export async function existsCache(key: string): Promise<boolean> {
  try {
    const client = await getRedisClient();
    const exists = await client.exists(key);
    return exists === 1;
  } catch (error) {
    logger.error({ err: error, key }, 'Failed to check cache existence');
    throw error;
  }
}

export default getRedisClient;
