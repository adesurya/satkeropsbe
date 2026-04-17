'use strict';

/**
 * Migration: Fix column sizes — ubah VARCHAR(255) ke TEXT
 * untuk kolom yang bisa menerima data panjang dari API sumber.
 *
 * Jalankan: node migrations/fix_column_sizes.js
 *
 * AMAN dijalankan berulang kali (idempotent).
 */
require('dotenv').config();
const { sequelize } = require('../src/config/database');
const logger = require('../src/utils/logger');

const TABLES = ['laporan_a', 'laporan_b'];

// Kolom yang perlu diubah → tipe baru
const COLUMN_CHANGES = [
  { column: 'no_laporan',              type: 'TEXT' },
  { column: 'no_sttlp',               type: 'TEXT' },
  { column: 'apa_terjadi',            type: 'TEXT' },
  { column: 'uraian_singkat_kejadian',type: 'TEXT' },
  { column: 'waktu_kejadian_faktual', type: 'TEXT' },
  { column: 'bagaimana_terjadi',      type: 'LONGTEXT' },
  { column: 'uraian_kejadian',        type: 'LONGTEXT' },
  { column: 'nama_mengetahui',        type: 'VARCHAR(150)' },
  { column: 'nama_pembuat',           type: 'VARCHAR(150)' },
  { column: 'nama_polda',             type: 'VARCHAR(200)' },
  { column: 'nama_polres',            type: 'VARCHAR(200)' },
  { column: 'nama_polsek',            type: 'VARCHAR(200)' },
];

const run = async () => {
  try {
    await sequelize.authenticate();
    logger.info('✅ Database connected');
    logger.info('🔧 Mulai ALTER TABLE untuk fix column sizes...\n');

    for (const table of TABLES) {
      logger.info(`📋 Table: ${table}`);

      for (const { column, type } of COLUMN_CHANGES) {
        try {
          await sequelize.query(
            `ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ${type} NULL`
          );
          logger.info(`   ✅ ${column} → ${type}`);
        } catch (err) {
          // Jika kolom tidak ada, lewati
          if (err.message.includes("Unknown column") || err.message.includes("Can't DROP")) {
            logger.info(`   ⚠️  ${column} — kolom tidak ditemukan, skip`);
          } else {
            logger.warn(`   ❌ ${column} — ${err.message}`);
          }
        }
      }
      logger.info('');
    }

    logger.info('✅ Migrasi selesai! Restart server dan coba sync ulang.');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Migrasi gagal:', error.message);
    process.exit(1);
  }
};

run();