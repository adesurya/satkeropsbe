'use strict';

const { AuditLog } = require('../models');
const logger = require('../utils/logger');

// Path yang tidak perlu diaudit (noise / non-sensitif)
const SKIP_EXACT = new Set(['/health']);
const SKIP_PREFIX = ['/docs'];

const shouldSkip = (path) => {
  if (SKIP_EXACT.has(path)) return true;
  return SKIP_PREFIX.some((p) => path.startsWith(p));
};

/**
 * Mencatat akses ke data sensitif SETELAH respons terkirim (event 'finish').
 * Dirancang non-blocking & defensif: kegagalan audit TIDAK boleh memengaruhi
 * request user. Mencatat request terautentikasi + percobaan login.
 */
const auditAccess = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    try {
      const path = (req.originalUrl || req.url || '').split('?')[0];
      if (shouldSkip(path)) return;

      const isLogin = path.endsWith('/auth/login');
      // Hanya audit request terautentikasi atau percobaan login
      if (!req.user && !isLogin) return;

      AuditLog.create({
        request_id: req.id || null,
        user_id: req.user?.id || null,
        username: req.user?.username || (isLogin ? (req.body?.username || null) : null),
        role: req.user?.role || null,
        method: req.method,
        path: path.substring(0, 255),
        query: (req.query && Object.keys(req.query).length) ? req.query : null,
        status_code: res.statusCode,
        ip: req.ip,
        id_polda: req.user?.id_polda || null,
        id_polres: req.user?.id_polres || null,
        duration_ms: Date.now() - start,
      }).catch((err) => logger.warn('[Audit] gagal mencatat:', err.message));
    } catch (err) {
      // jangan pernah melempar dari handler 'finish'
      logger.warn('[Audit] error:', err.message);
    }
  });

  next();
};

module.exports = { auditAccess };