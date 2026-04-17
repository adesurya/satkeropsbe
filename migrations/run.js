'use strict';

/**
 * Migration runner — creates all tables in correct order
 * Run: node migrations/run.js
 */
require('dotenv').config();
const { sequelize } = require('../src/config/database');
const logger = require('../src/utils/logger');

// Import all models so Sequelize registers them
require('../src/models/User');
require('../src/models/LaporanA');
require('../src/models/LaporanB');
require('../src/models/Terlibat');
require('../src/models/ApiSetting');
require('../src/models/SyncLog');

const run = async () => {
  try {
    await sequelize.authenticate();
    logger.info('✅ Database connected');

    // force: false — won't drop existing tables
    // alter: true  — adds missing columns safely
    await sequelize.sync({ alter: true });
    logger.info('✅ All tables synced successfully');

    logger.info('\n📋 Tables created/updated:');
    logger.info('  - users');
    logger.info('  - laporan_a');
    logger.info('  - laporan_b');
    logger.info('  - terlibat');
    logger.info('  - api_settings');
    logger.info('  - sync_logs');

    process.exit(0);
  } catch (error) {
    logger.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
};

run();
