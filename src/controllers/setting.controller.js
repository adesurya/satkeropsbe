'use strict';

const { ApiSetting, SyncLog } = require('../models');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const syncService = require('../services/sync.service');
const schedulerService = require('../services/scheduler.service');

const DEFAULT_SETTINGS = [
  { key: 'sync_interval_minutes', value: '60', type: 'number', description: 'Interval sinkronisasi data dari API sumber (menit)' },
  { key: 'sync_enabled', value: 'true', type: 'boolean', description: 'Aktifkan sinkronisasi otomatis' },
  { key: 'sync_limit_per_request', value: '500', type: 'number', description: 'Jumlah data per request ke API sumber' },
  { key: 'source_api_base_url', value: '', type: 'string', description: 'Base URL API sumber data', is_sensitive: false },
  { key: 'source_api_token', value: '', type: 'string', description: 'Token autentikasi API sumber', is_sensitive: true },
  { key: 'sync_lp_a_enabled', value: 'true', type: 'boolean', description: 'Aktifkan sync LP Model A' },
  { key: 'sync_lp_b_enabled', value: 'true', type: 'boolean', description: 'Aktifkan sync LP Model B' },
  { key: 'sync_days_back', value: '7', type: 'number', description: 'Ambil data N hari ke belakang saat sync' },
  { key: 'anomaly_threshold', value: '2.0', type: 'number', description: 'Z-score threshold untuk deteksi anomali' },
  { key: 'heatmap_max_points', value: '2000', type: 'number', description: 'Maksimal titik heatmap yang dikembalikan' },
];

const SettingController = {
  /**
   * GET /settings
   */
  async index(req, res) {
    try {
      const settings = await ApiSetting.findAll({ order: [['key', 'ASC']] });
      // Mask sensitive values for non-admin
      const safe = settings.map(s => {
        const obj = s.toJSON();
        if (obj.is_sensitive && req.user.role !== 'admin') {
          obj.value = obj.value ? '••••••••' : '';
        }
        return obj;
      });
      return ApiResponse.success(res, safe);
    } catch (error) {
      logger.error('Settings index error:', error);
      return ApiResponse.error(res);
    }
  },

  /**
   * GET /settings/:key
   */
  async show(req, res) {
    try {
      const setting = await ApiSetting.findOne({ where: { key: req.params.key } });
      if (!setting) return ApiResponse.notFound(res, 'Setting tidak ditemukan');
      if (setting.is_sensitive && req.user.role !== 'admin') {
        return ApiResponse.forbidden(res, 'Setting sensitif hanya dapat diakses admin');
      }
      return ApiResponse.success(res, setting);
    } catch (error) {
      return ApiResponse.error(res);
    }
  },

  /**
   * PUT /settings/:key
   */
  async update(req, res) {
    try {
      const { key } = req.params;
      const { value, description } = req.body;

      let setting = await ApiSetting.findOne({ where: { key } });
      if (!setting) return ApiResponse.notFound(res, 'Setting tidak ditemukan');

      await setting.update({ value: String(value), description: description || setting.description, updated_by: req.user.id });

      // If interval changed, reschedule
      if (key === 'sync_interval_minutes' || key === 'sync_enabled') {
        await schedulerService.reschedule();
      }

      logger.info(`Setting updated: ${key} = ${setting.is_sensitive ? '***' : value} by ${req.user.username}`);
      return ApiResponse.success(res, setting, 'Setting berhasil diperbarui');
    } catch (error) {
      logger.error('Settings update error:', error);
      return ApiResponse.error(res);
    }
  },

  /**
   * POST /settings/init
   * Initialize default settings (admin only, idempotent)
   */
  async init(req, res) {
    try {
      let created = 0;
      for (const s of DEFAULT_SETTINGS) {
        const [, wasCreated] = await ApiSetting.findOrCreate({ where: { key: s.key }, defaults: s });
        if (wasCreated) created++;
      }
      return ApiResponse.success(res, { created }, `${created} setting default dibuat`);
    } catch (error) {
      logger.error('Settings init error:', error);
      return ApiResponse.error(res);
    }
  },

  /**
   * POST /settings/sync/trigger
   * Manually trigger sync
   */
  async triggerSync(req, res) {
    try {
      const tipe = req.query.tipe; // 'a', 'b', or undefined (both)
      res.status(202).json({ success: true, message: 'Sinkronisasi dimulai di background', timestamp: new Date() });

      // Fire & forget
      syncService.syncAll(tipe).catch(e => logger.error('Manual sync error:', e));
    } catch (error) {
      logger.error('Trigger sync error:', error);
      return ApiResponse.error(res);
    }
  },

  /**
   * GET /settings/sync/logs
   */
  async syncLogs(req, res) {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, parseInt(req.query.limit) || 20);
      const where = {};
      if (req.query.tipe) where.tipe = req.query.tipe;
      if (req.query.status) where.status = req.query.status;

      const { count, rows } = await SyncLog.findAndCountAll({
        where,
        order: [['started_at', 'DESC']],
        limit,
        offset: (page - 1) * limit,
      });

      return ApiResponse.paginated(res, rows, { total: count, page, limit });
    } catch (error) {
      logger.error('Sync logs error:', error);
      return ApiResponse.error(res);
    }
  },
};

module.exports = SettingController;
