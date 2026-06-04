'use strict';

require('dotenv').config();

// Konfigurasi khusus sequelize-cli (migration/seeder).
// Sengaja dipisah dari src/config/database.js (yang dipakai runtime aplikasi),
// tapi sumber kredensialnya sama (env), sehingga tidak ada divergensi.
const common = {
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  dialect: 'mysql',
  timezone: '+07:00',
  define: {
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
  },
  dialectOptions: {
    charset: 'utf8mb4',
  },
  logging: false,
};

module.exports = {
  development: common,
  test: common,
  production: common,
};