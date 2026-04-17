'use strict';

const cron = require('node-cron');
const { ApiSetting } = require('../models');
const syncService = require('./sync.service');
const logger = require('../utils/logger');

let currentTask = null;

const getSetting = async (key, def) => {
  try {
    const s = await ApiSetting.findOne({ where: { key } });
    return s?.value ?? def;
  } catch {
    return def;
  }
};

/**
 * Convert interval hours to cron expression
 * Default: every 6 hours → "0 0,6,12,18 * * *"
 */
const hoursToCron = (hours) => {
  const h = parseInt(hours) || 6;
  if (h <= 0 || h >= 24) return '0 0,6,12,18 * * *';
  if (h === 1)  return '0 * * * *';
  if (h === 2)  return '0 */2 * * *';
  if (h === 3)  return '0 */3 * * *';
  if (h === 4)  return '0 */4 * * *';
  if (h === 6)  return '0 0,6,12,18 * * *';   // exactly 00:00, 06:00, 12:00, 18:00
  if (h === 8)  return '0 0,8,16 * * *';
  if (h === 12) return '0 0,12 * * *';
  if (h === 24) return '0 0 * * *';
  return `0 */${h} * * *`;
};

/**
 * Start the scheduler
 */
const start = async () => {
  try {
    const enabled = await getSetting('sync_enabled', 'true');
    if (enabled !== 'true') {
      logger.info('[Scheduler] Sinkronisasi otomatis dinonaktifkan');
      return;
    }

    // Interval in HOURS (changed from minutes)
    const intervalHours = await getSetting('sync_interval_hours', '6');
    const cronExpr = hoursToCron(intervalHours);

    logger.info(`[Scheduler] Memulai scheduler: setiap ${intervalHours} jam (cron: ${cronExpr})`);

    if (currentTask) {
      currentTask.stop();
      currentTask = null;
    }

    currentTask = cron.schedule(cronExpr, async () => {
      logger.info('[Scheduler] ⏰ Memulai sinkronisasi otomatis...');
      try {
        // Sync last 2 days on every run to catch any delayed/corrected data
        const results = await syncService.syncAll({
          triggeredBy: 'scheduler',
          daysBack: 2,
        });
        logger.info('[Scheduler] ✅ Sinkronisasi selesai:', JSON.stringify(results));
      } catch (err) {
        logger.error('[Scheduler] ❌ Sinkronisasi gagal:', err.message);
      }
    }, { timezone: 'Asia/Jakarta' });

  } catch (error) {
    logger.error('[Scheduler] Gagal memulai scheduler:', error.message);
  }
};

/**
 * Reschedule (called when sync_interval_hours setting changes)
 */
const reschedule = async () => {
  logger.info('[Scheduler] Menjadwal ulang...');
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
  }
  await start();
};

/**
 * Stop scheduler (called on graceful shutdown)
 */
const stop = () => {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
    logger.info('[Scheduler] Scheduler dihentikan');
  }
};

module.exports = { start, stop, reschedule };