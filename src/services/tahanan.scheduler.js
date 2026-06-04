'use strict';

const cron = require('node-cron');
const { ApiSetting } = require('../models');
const tahananService = require('./tahanan.service');
const logger = require('../utils/logger');

let task = null;

const getValue = async (key, fallback) => {
  try {
    const row = await ApiSetting.findOne({ where: { key } });
    return row && row.value !== null && row.value !== undefined ? row.value : fallback;
  } catch {
    return fallback;
  }
};

const buildCron = (hours) => {
  const h = Math.max(1, parseInt(hours, 10) || 6);
  // setiap H jam; bila H >= 24 jalankan harian pukul 00:00
  return h >= 24 ? '0 0 * * *' : `0 */${h} * * *`;
};

const TahananScheduler = {
  async start() {
    const enabled = String(await getValue('tahanan_sync_enabled', 'true')).toLowerCase() === 'true';
    if (!enabled) {
      logger.info('[TahananScheduler] dinonaktifkan (tahanan_sync_enabled=false)');
      return;
    }

    const hours = await getValue('tahanan_sync_interval_hours', '6');
    const expr = buildCron(hours);

    if (task) task.stop();
    task = cron.schedule(expr, async () => {
      try {
        logger.info('[TahananScheduler] menjalankan sync terjadwal...');
        await tahananService.sync({ triggeredBy: 'scheduler' });
      } catch (e) {
        logger.error('[TahananScheduler] sync error:', e.message);
      }
    });

    logger.info(`[TahananScheduler] aktif, cron="${expr}" (tiap ${hours} jam)`);

    // Probe sekali saat start (non-blocking), kecuali dimatikan
    if (process.env.SKIP_STARTUP_SYNC !== 'true') {
      setImmediate(async () => {
        try {
          await tahananService.sync({ triggeredBy: 'startup' });
        } catch (e) {
          logger.warn('[TahananScheduler] startup sync error (non-fatal):', e.message);
        }
      });
    }
  },

  async reschedule() {
    logger.info('[TahananScheduler] reschedule diminta');
    await this.start();
  },

  stop() {
    if (task) { task.stop(); task = null; logger.info('[TahananScheduler] dihentikan'); }
  },
};

module.exports = TahananScheduler;