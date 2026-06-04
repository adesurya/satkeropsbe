'use strict';

const { sequelize } = require('../config/database');
const User = require('./User');
const LaporanA = require('./LaporanA');
const LaporanB = require('./LaporanB');
const Terlibat = require('./Terlibat');
const ApiSetting = require('./ApiSetting');
const SyncLog = require('./SyncLog');
const Polda = require('./Polda');
const Polres = require('./Polres');
const AuditLog = require('./AuditLog');
const Tahanan = require('./Tahanan');

// ── Associations ────────────────────────────────────────────────────────────
// Master wilayah: satu polda punya banyak polres (relasi logis, tanpa FK keras
// agar konsisten dengan tabel laporan yang datanya berasal dari API eksternal).
Polda.hasMany(Polres, { foreignKey: 'kode_polda', sourceKey: 'kode_polda', as: 'polres' });
Polres.belongsTo(Polda, { foreignKey: 'kode_polda', targetKey: 'kode_polda', as: 'polda' });

// Catatan: laporan_a / laporan_b / terlibat / audit_logs / tahanan TIDAK diberi
// FK constraint. Integritas dijaga di level aplikasi (data dari sinkronisasi API).

const models = {
  User, LaporanA, LaporanB, Terlibat, ApiSetting, SyncLog,
  Polda, Polres, AuditLog, Tahanan, sequelize,
};

module.exports = models;