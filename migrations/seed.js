'use strict';

require('dotenv').config();
const { sequelize } = require('../src/config/database');
const User = require('../src/models/User');
const ApiSetting = require('../src/models/ApiSetting');
const logger = require('../src/utils/logger');

const DEFAULT_SETTINGS = [
  // ── Sync schedule ──────────────────────────────────────────────────────────
  { key: 'sync_enabled',           value: 'true',                                   type: 'boolean', description: 'Aktifkan sinkronisasi otomatis' },
  { key: 'sync_interval_hours',    value: '6',                                      type: 'number',  description: 'Interval sinkronisasi (jam) — default 6 jam (00:00, 06:00, 12:00, 18:00 WIB)' },
  { key: 'sync_days_back',         value: '2',                                      type: 'number',  description: 'Jumlah hari ke belakang yang diambil setiap sync' },
  { key: 'sync_lp_a_enabled',      value: 'true',                                   type: 'boolean', description: 'Aktifkan sync LP Model A (/lp_a)' },
  { key: 'sync_lp_b_enabled',      value: 'true',                                   type: 'boolean', description: 'Aktifkan sync LP Model B (/lp_b)' },

  // ── Source API connection ──────────────────────────────────────────────────
  { key: 'source_api_base_url',    value: 'https://dors.stamaops.polri.go.id/api/v1', type: 'string',  description: 'Base URL API sumber data (dors.stamaops.polri.go.id)', is_sensitive: false },
  { key: 'source_api_client_id',   value: '',                                       type: 'string',  description: 'Nilai header CLIENTID untuk autentikasi API sumber',  is_sensitive: true },
  { key: 'source_api_cookie',      value: '',                                       type: 'string',  description: 'Nilai header Cookie (laravel_session) untuk API sumber', is_sensitive: true },

  // ── Dashboard & cache ──────────────────────────────────────────────────────
  { key: 'anomaly_threshold',      value: '2.0',                                    type: 'number',  description: 'Z-score threshold untuk deteksi anomali (default 2.0)' },
  { key: 'heatmap_max_points',     value: '2000',                                   type: 'number',  description: 'Maksimal titik heatmap yang dikembalikan' },
  { key: 'cache_ttl_seconds',      value: '21600',                                  type: 'number',  description: 'TTL cache Redis dalam detik (default 21600 = 6 jam)' },
];

const seed = async () => {
  try {
    await sequelize.authenticate();
    logger.info('✅ Database connected');

    // ── Admin user ─────────────────────────────────────────────────────────
    const existing = await User.findOne({ where: { username: 'admin' } });
    if (!existing) {
      await User.create({
        nama: 'Administrator', username: 'admin',
        email: 'admin@crimedashboard.id', password: 'Admin@1234!',
        role: 'admin', is_active: true,
      });
      logger.info('✅ Admin user created  →  username: admin  |  password: Admin@1234!');
      logger.info('   ⚠️  GANTI PASSWORD SEGERA SETELAH LOGIN PERTAMA!');
    } else {
      logger.info('ℹ️  Admin user already exists, skipped');
    }

    // ── Demo manager ──────────────────────────────────────────────────────
    const mgr = await User.findOne({ where: { username: 'manager' } });
    if (!mgr) {
      await User.create({
        nama: 'Manager Demo', username: 'manager',
        email: 'manager@crimedashboard.id', password: 'Manager@1234!',
        role: 'manager', is_active: true,
      });
      logger.info('✅ Manager user created → username: manager  |  password: Manager@1234!');
    }

    // ── Default settings ───────────────────────────────────────────────────
    let created = 0;
    for (const s of DEFAULT_SETTINGS) {
      const [, wasCreated] = await ApiSetting.findOrCreate({ where: { key: s.key }, defaults: s });
      if (wasCreated) created++;
    }
    logger.info(`✅ ${created} setting baru dibuat (${DEFAULT_SETTINGS.length - created} sudah ada)`);

    logger.info('\n🎉 Seeding selesai!');
    logger.info(`   API Docs: http://localhost:${process.env.PORT || 5000}/api/${process.env.API_VERSION || 'v1'}/docs`);
    logger.info('\n📌 Langkah berikutnya:');
    logger.info('   1. Set CLIENTID via: PUT /api/v1/settings/source_api_client_id');
    logger.info('   2. Set Cookie   via: PUT /api/v1/settings/source_api_cookie');
    logger.info('   3. Trigger sync via: POST /api/v1/settings/sync/trigger\n');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Seeding gagal:', error.message);
    process.exit(1);
  }
};

seed();