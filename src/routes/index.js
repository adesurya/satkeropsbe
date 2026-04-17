'use strict';

const express = require('express');
const Joi = require('joi');
const router = express.Router();

const { authenticate } = require('../middleware/auth');
const { authorize, requireMinRole, applyWilayahScope } = require('../middleware/rbac');
const { validate, schemas } = require('../middleware/validate');
const { authLimiter, syncLimiter } = require('../middleware/rateLimiter');

const AuthController      = require('../controllers/auth.controller');
const UserController      = require('../controllers/user.controller');
const LaporanController   = require('../controllers/laporan.controller');
const DashboardController = require('../controllers/dashboard.controller');
const InsightController   = require('../controllers/insight.controller');
const SettingController   = require('../controllers/setting.controller');

// ── Health ─────────────────────────────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date(), version: process.env.API_VERSION || 'v1' });
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
router.get('/users/:id',          authenticate, applyWilayahScope, UserController.show);
router.put('/users/:id',          authenticate, requireMinRole('polda'), validate(schemas.updateUser), UserController.update);
router.delete('/users/:id',       authenticate, authorize('admin', 'manager'), UserController.destroy);
router.patch('/users/:id/toggle-active', authenticate, authorize('admin', 'manager'), UserController.toggleActive);
router.post('/users/:id/unlock',  authenticate, authorize('admin'), UserController.unlock);

// ── Laporan ────────────────────────────────────────────────────────────────────
const lq = validate(schemas.laporanQuery, 'query');
router.get('/laporan/a',      authenticate, applyWilayahScope, lq, LaporanController.indexA);
router.get('/laporan/a/:id',  authenticate, applyWilayahScope, LaporanController.showA);
router.get('/laporan/b',      authenticate, applyWilayahScope, lq, LaporanController.indexB);
router.get('/laporan/b/:id',  authenticate, applyWilayahScope, LaporanController.showB);
router.get('/laporan/search', authenticate, applyWilayahScope, lq, LaporanController.search);

// ── Dashboard ──────────────────────────────────────────────────────────────────
router.get('/dashboard/summary',       authenticate, applyWilayahScope, DashboardController.summary);
router.get('/dashboard/heatmap',       authenticate, applyWilayahScope, DashboardController.heatmap);
router.get('/dashboard/trend',         authenticate, applyWilayahScope, DashboardController.trend);
router.get('/dashboard/drilldown',     authenticate, applyWilayahScope, DashboardController.drilldown);
router.get('/dashboard/korban-pelaku', authenticate, applyWilayahScope, DashboardController.korbanPelaku);
router.get('/dashboard/anomaly',       authenticate, applyWilayahScope, DashboardController.anomaly);
router.get('/dashboard/clustering',    authenticate, applyWilayahScope, DashboardController.clustering);

// ── Insight ────────────────────────────────────────────────────────────────────
router.post('/insight/classify',    authenticate, requireMinRole('polres'), InsightController.classify);
router.get('/insight/briefing',     authenticate, applyWilayahScope, requireMinRole('polres'), InsightController.briefing);
router.get('/insight/smart-search', authenticate, applyWilayahScope, InsightController.smartSearch);
router.get('/insight/forecast',     authenticate, applyWilayahScope, requireMinRole('polda'), InsightController.forecast);

// ── Settings (static routes BEFORE :key param) ─────────────────────────────────
router.get('/settings',               authenticate, requireMinRole('manager'), SettingController.index);
router.get('/settings/sync/logs',     authenticate, requireMinRole('manager'), SettingController.syncLogs);
router.post('/settings/init',         authenticate, authorize('admin'), SettingController.init);
router.post('/settings/sync/trigger', authenticate, authorize('admin', 'manager'), syncLimiter, SettingController.triggerSync);
router.get('/settings/:key',          authenticate, requireMinRole('manager'), SettingController.show);
router.put('/settings/:key',          authenticate, authorize('admin'), validate(schemas.updateSetting), SettingController.update);

module.exports = router;
