'use strict';

const express = require('express');
const Joi = require('joi');
const router = express.Router();

const { sequelize } = require('../config/database');
const cache = require('../utils/cache');

const { authenticate } = require('../middleware/auth');
const { authorize, requireMinRole, applyWilayahScope } = require('../middleware/rbac');
const { validate, schemas } = require('../middleware/validate');
const { authLimiter, syncLimiter, aiLimiter } = require('../middleware/rateLimiter');
const { auditAccess } = require('../middleware/audit');

const AuthController      = require('../controllers/auth.controller');
const UserController      = require('../controllers/user.controller');
const LaporanController   = require('../controllers/laporan.controller');
const DashboardController = require('../controllers/dashboard.controller');
const InsightController   = require('../controllers/insight.controller');
const SettingController   = require('../controllers/setting.controller');
const WilayahController   = require('../controllers/wilayah.controller');
const ExportController    = require('../controllers/export.controller');
const AuditController     = require('../controllers/audit.controller');
const TahananController   = require('../controllers/tahanan.controller');

const uuid = validate(schemas.uuidParam, 'params');

// ── Audit: pasang paling awal supaya listener 'finish' membungkus semua route ───
// (Middleware ini hanya MENCATAT setelah respons terkirim, non-blocking.)
router.use(auditAccess);

// ── Health (dalam: cek DB + Redis) ──────────────────────────────────────────────
router.get('/health', async (req, res) => {
  const health = {
    status: 'OK',
    timestamp: new Date(),
    version: process.env.API_VERSION || 'v1',
    components: {},
  };

  try {
    await sequelize.authenticate();
    health.components.database = 'up';
  } catch (e) {
    health.components.database = 'down';
    health.status = 'DEGRADED';
  }

  // Redis bersifat opsional → tidak membuat health gagal total
  health.components.redis = cache.isReady() ? 'up' : 'down';
  if (health.components.redis === 'down' && health.status === 'OK') {
    health.status = 'DEGRADED';
  }

  // Hanya DB yang kritikal → 503 bila DB mati (mempengaruhi container healthcheck)
  const code = health.components.database === 'down' ? 503 : 200;
  return res.status(code).json(health);
});

// ── Auth ───────────────────────────────────────────────────────────────────────
router.post('/auth/login', authLimiter, validate(schemas.login), AuthController.login);
router.post('/auth/refresh', AuthController.refreshToken);
router.post('/auth/logout', authenticate, AuthController.logout);
router.get('/auth/me', authenticate, AuthController.me);

const changePwSchema = Joi.object({
  old_password: Joi.string().min(6).required(),
  new_password: Joi.string().min(8).max(64)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required()
    .messages({ 'string.pattern.base': 'Password harus kombinasi huruf besar, kecil, angka, karakter spesial' }),
});
router.put('/auth/change-password', authenticate, validate(changePwSchema), AuthController.changePassword);

// ── Users ──────────────────────────────────────────────────────────────────────
router.get('/users',              authenticate, requireMinRole('polda'), applyWilayahScope, UserController.index);
router.post('/users',             authenticate, requireMinRole('polda'), validate(schemas.createUser), UserController.create);
router.get('/users/:id',          authenticate, uuid, applyWilayahScope, UserController.show);
router.put('/users/:id',          authenticate, uuid, requireMinRole('polda'), validate(schemas.updateUser), UserController.update);
router.delete('/users/:id',       authenticate, uuid, authorize('admin', 'manager'), UserController.destroy);
router.patch('/users/:id/toggle-active', authenticate, uuid, authorize('admin', 'manager'), UserController.toggleActive);
router.post('/users/:id/unlock',  authenticate, uuid, authorize('admin'), UserController.unlock);

// ── Wilayah (master polda & polres) ──────────────────────────────────────────────
const wq = validate(schemas.wilayahQuery, 'query');
router.get('/wilayah/polda',  authenticate, wq, WilayahController.listPolda);
router.get('/wilayah/polres', authenticate, wq, WilayahController.listPolres);

// ── Laporan ────────────────────────────────────────────────────────────────────
const lq = validate(schemas.laporanQuery, 'query');
router.get('/laporan/by-lp',  authenticate, applyWilayahScope, validate(schemas.searchLP, 'query'), LaporanController.searchByNoLP);
router.get('/laporan/search', authenticate, applyWilayahScope, lq, LaporanController.search);
router.get('/laporan/a',      authenticate, applyWilayahScope, lq, LaporanController.indexA);
router.get('/laporan/a/:id',  authenticate, applyWilayahScope, LaporanController.showA);
router.get('/laporan/b',      authenticate, applyWilayahScope, lq, LaporanController.indexB);
router.get('/laporan/b/:id',  authenticate, applyWilayahScope, LaporanController.showB);

// ── Export (ter-scope wilayah) ───────────────────────────────────────────────────
router.get('/export/laporan',           authenticate, applyWilayahScope, ExportController.laporan);
router.get('/export/dashboard/summary', authenticate, applyWilayahScope, ExportController.dashboardSummary);

// ── Tahanan (data dari API sumber /tahanan) ──────────────────────────────────────
const tq = validate(schemas.tahananQuery, 'query');
router.get('/tahanan/sync/status',  authenticate, requireMinRole('manager'), TahananController.syncStatus);
router.post('/tahanan/sync/trigger', authenticate, authorize('admin', 'manager'), syncLimiter, validate(schemas.tahananSync, 'query'), TahananController.triggerSync);
router.get('/tahanan/stats/summary', authenticate, applyWilayahScope, tq, TahananController.summary);
router.get('/tahanan',               authenticate, applyWilayahScope, tq, TahananController.index);
router.get('/tahanan/:id',           authenticate, applyWilayahScope, TahananController.show);

// ── Dashboard ──────────────────────────────────────────────────────────────────
router.get('/dashboard/summary',       authenticate, applyWilayahScope, DashboardController.summary);
router.get('/dashboard/heatmap',       authenticate, applyWilayahScope, DashboardController.heatmap);
router.get('/dashboard/trend',         authenticate, applyWilayahScope, DashboardController.trend);
router.get('/dashboard/drilldown',     authenticate, applyWilayahScope, DashboardController.drilldown);
router.get('/dashboard/korban-pelaku', authenticate, applyWilayahScope, DashboardController.korbanPelaku);
router.get('/dashboard/anomaly',       authenticate, applyWilayahScope, DashboardController.anomaly);
router.get('/dashboard/clustering',    authenticate, applyWilayahScope, DashboardController.clustering);

// ── Insight (AI) — limiter khusus karena mahal (MIN-4) ───────────────────────────
router.post('/insight/classify',    authenticate, aiLimiter, requireMinRole('polres'), InsightController.classify);
router.get('/insight/briefing',     authenticate, aiLimiter, applyWilayahScope, requireMinRole('polres'), InsightController.briefing);
router.get('/insight/smart-search', authenticate, aiLimiter, applyWilayahScope, InsightController.smartSearch);
router.get('/insight/forecast',     authenticate, aiLimiter, applyWilayahScope, requireMinRole('polda'), InsightController.forecast);

// ── Audit log ────────────────────────────────────────────────────────────────────
router.get('/audit/logs', authenticate, requireMinRole('manager'), AuditController.index);

// ── Settings (static routes BEFORE :key param) ─────────────────────────────────
router.get('/settings',               authenticate, requireMinRole('manager'), SettingController.index);
router.get('/settings/sync/logs',     authenticate, requireMinRole('manager'), SettingController.syncLogs);
router.post('/settings/init',         authenticate, authorize('admin'), SettingController.init);
router.post('/settings/sync/trigger', authenticate, authorize('admin', 'manager'), syncLimiter, SettingController.triggerSync);
router.get('/settings/:key',          authenticate, requireMinRole('manager'), SettingController.show);
router.put('/settings/:key',          authenticate, authorize('admin'), validate(schemas.updateSetting), SettingController.update);

module.exports = router;