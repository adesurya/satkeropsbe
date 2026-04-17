'use strict';

const { createClient } = require('redis');
const logger = require('./logger');

let client = null;
let isConnected = false;

/**
 * Initialize Redis connection (called once at app startup)
 */
const connect = async () => {
  if (client) return client;

  const redisUrl = process.env.REDIS_URL ||
    `redis://${process.env.REDIS_PASSWORD ? `:${process.env.REDIS_PASSWORD}@` : ''}${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;

  client = createClient({
    url: redisUrl,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 5) {
          logger.warn('[Redis] Max reconnect attempts reached, disabling cache');
          return false;
        }
        return Math.min(retries * 200, 3000);
      },
    },
  });

  client.on('connect',   () => { isConnected = true;  logger.info('[Redis] ✅ Connected'); });
  client.on('ready',     () => { isConnected = true; });
  client.on('error',     (err) => { isConnected = false; logger.warn('[Redis] ⚠️  Error:', err.message); });
  client.on('end',       () => { isConnected = false; logger.warn('[Redis] Disconnected'); });

  try {
    await client.connect();
  } catch (err) {
    logger.warn('[Redis] ⚠️  Could not connect, running without cache:', err.message);
    isConnected = false;
  }

  return client;
};

/**
 * Disconnect Redis
 */
const disconnect = async () => {
  if (client && isConnected) {
    await client.quit();
    isConnected = false;
    logger.info('[Redis] Disconnected gracefully');
  }
};

/**
 * Get value from cache
 * Returns parsed JSON or null if miss / Redis unavailable
 */
const get = async (key) => {
  if (!isConnected || !client) return null;
  try {
    const val = await client.get(key);
    return val ? JSON.parse(val) : null;
  } catch (err) {
    logger.warn(`[Redis] GET error for key "${key}":`, err.message);
    return null;
  }
};

/**
 * Set value in cache with TTL in seconds
 * Default TTL: 6 hours (matches sync interval)
 */
const set = async (key, value, ttlSeconds = null) => {
  if (!isConnected || !client) return false;
  const ttl = ttlSeconds ?? parseInt(process.env.REDIS_TTL || 21600); // default 6h
  try {
    await client.setEx(key, ttl, JSON.stringify(value));
    return true;
  } catch (err) {
    logger.warn(`[Redis] SET error for key "${key}":`, err.message);
    return false;
  }
};

/**
 * Delete single key
 */
const del = async (key) => {
  if (!isConnected || !client) return false;
  try {
    await client.del(key);
    return true;
  } catch (err) {
    logger.warn(`[Redis] DEL error for key "${key}":`, err.message);
    return false;
  }
};

/**
 * Delete all keys matching a pattern (e.g. "dashboard:*")
 */
const delPattern = async (pattern) => {
  if (!isConnected || !client) return 0;
  try {
    const keys = await client.keys(pattern);
    if (keys.length === 0) return 0;
    await client.del(keys);
    logger.info(`[Redis] Flushed ${keys.length} keys matching "${pattern}"`);
    return keys.length;
  } catch (err) {
    logger.warn(`[Redis] DEL pattern error for "${pattern}":`, err.message);
    return 0;
  }
};

/**
 * Cache-aside helper: get from cache, or execute fn() and cache result
 * @param {string} key
 * @param {Function} fn - async function returning data
 * @param {number} ttl - TTL in seconds (default: 6h)
 */
const remember = async (key, fn, ttl = null) => {
  const cached = await get(key);
  if (cached !== null) {
    return { data: cached, fromCache: true };
  }
  const data = await fn();
  await set(key, data, ttl);
  return { data, fromCache: false };
};

/**
 * Build a cache key from prefix + query params object
 * Sorts keys for consistency
 */
const buildKey = (prefix, params = {}) => {
  const sorted = Object.keys(params).sort().reduce((acc, k) => {
    if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
      acc[k] = params[k];
    }
    return acc;
  }, {});
  return `${prefix}:${JSON.stringify(sorted)}`;
};

const isReady = () => isConnected;

module.exports = { connect, disconnect, get, set, del, delPattern, remember, buildKey, isReady };