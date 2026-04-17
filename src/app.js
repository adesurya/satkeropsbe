'use strict';

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const xssClean = require('xss-clean');

const { testConnection } = require('./config/database');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');
const routes = require('./routes');
const swaggerSpec = require('./config/swagger');
const schedulerService = require('./services/scheduler.service');
const syncService = require('./services/sync.service');
const cache = require('./utils/cache');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 5000;
const API_PREFIX = `/api/${process.env.API_VERSION || 'v1'}`;

// ─── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'data:', 'https:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ─── CORS ─────────────────────────────────────────────────────────────────────
const DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:4173',
  'http://localhost:5173',
];
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : DEFAULT_ORIGINS;

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    logger.warn(`CORS blocked: ${origin}`);
    return callback(new Error(`CORS: Origin ${origin} tidak diizinkan`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 'Authorization', 'X-Request-ID',
    'X-Requested-With', 'Accept', 'Origin', 'Cache-Control',
  ],
  exposedHeaders: ['X-Request-ID'],
  credentials: true,
  optionsSuccessStatus: 204,
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ─── General Middleware ────────────────────────────────────────────────────────
app.use(xssClean());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
  stream: { write: (msg) => logger.info(msg.trim()) },
}));

app.use((req, res, next) => {
  req.id = require('crypto').randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
});

app.set('trust proxy', 1);

// ─── Rate Limiting ─────────────────────────────────────────────────────────────
app.use(API_PREFIX, apiLimiter);

// ─── Swagger ───────────────────────────────────────────────────────────────────
app.use(`${API_PREFIX}/docs`, swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Crime Dashboard API Docs',
  customCss: '.swagger-ui .topbar { background-color: #1a1a2e; }',
  swaggerOptions: { persistAuthorization: true },
}));
app.get(`${API_PREFIX}/docs.json`, (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// ─── Routes ────────────────────────────────────────────────────────────────────
app.use(API_PREFIX, routes);

// ─── Error Handling ────────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Bootstrap ─────────────────────────────────────────────────────────────────
const bootstrap = async () => {
  try {
    // 1. Database
    await testConnection();
    const { sequelize } = require('./config/database');
    if (process.env.NODE_ENV !== 'production') {
      await sequelize.sync({ alter: true });
      logger.info('✅ Database schema synced');
    }

    // 2. Redis
    await cache.connect();

    // 3. HTTP Server
    const server = app.listen(PORT, () => {
      logger.info(`🚀 ${process.env.APP_NAME || 'CrimeDashboardAPI'} running on port ${PORT}`);
      logger.info(`📖 API Docs  : http://localhost:${PORT}${API_PREFIX}/docs`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🔓 CORS origins: ${allowedOrigins.join(', ')}`);
      logger.info(`💾 Redis cache: ${cache.isReady() ? 'connected' : 'unavailable (running without cache)'}`);
    });

    // 4. Startup probe: check for new data, sync last 2 days if found
    if (process.env.SKIP_STARTUP_SYNC !== 'true') {
      setImmediate(async () => {
        try {
          await syncService.startupSync();
        } catch (e) {
          logger.warn('[Startup] Sync probe error (non-fatal):', e.message);
        }
      });
    }

    // 5. Recurring scheduler (every 6 hours)
    await schedulerService.start();

    // 6. Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`\n🛑 ${signal} received. Shutting down gracefully...`);
      schedulerService.stop();
      await cache.disconnect();
      server.close(() => {
        logger.info('✅ HTTP server closed');
        process.exit(0);
      });
      setTimeout(() => { logger.error('❌ Force exit'); process.exit(1); }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('❌ Bootstrap failed:', error.message);
    process.exit(1);
  }
};

bootstrap();

module.exports = app;