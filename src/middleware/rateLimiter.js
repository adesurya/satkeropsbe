'use strict';

const rateLimit = require('express-rate-limit');
const ApiResponse = require('../utils/apiResponse');

const createLimiter = (windowMs, max, message) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => ApiResponse.error(res, message, 429),
    skip: (req) => process.env.NODE_ENV === 'test',
  });

// General API limiter
const apiLimiter = createLimiter(
  parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  parseInt(process.env.RATE_LIMIT_MAX) || 100,
  'Terlalu banyak request. Coba lagi dalam 15 menit.'
);

// Strict limiter for auth endpoints
const authLimiter = createLimiter(
  15 * 60 * 1000,
  parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.'
);

// Sync trigger limiter
const syncLimiter = createLimiter(
  60 * 1000,
  5,
  'Terlalu banyak permintaan sinkronisasi. Tunggu 1 menit.'
);

module.exports = { apiLimiter, authLimiter, syncLimiter };
