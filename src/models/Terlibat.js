'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Terlibat = sequelize.define('Terlibat', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: false },
  id_laporan: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  tipe_laporan: { type: DataTypes.ENUM('a', 'b'), allowNull: false, defaultValue: 'a' },
  nik: { type: DataTypes.STRING(30), allowNull: true },
  keterlibatan: { type: DataTypes.ENUM('pelapor', 'korban', 'saksi', 'terlapor'), allowNull: true },
  nama: { type: DataTypes.STRING(150), allowNull: true },
  gender: { type: DataTypes.STRING(5), allowNull: true },
  tempat_lahir: { type: DataTypes.STRING(100), allowNull: true },
  tgl_lahir: { type: DataTypes.STRING(20), allowNull: true },
  kewarganegaraan: { type: DataTypes.STRING(50), allowNull: true },
  pekerjaan: { type: DataTypes.STRING(100), allowNull: true },
  alamat: { type: DataTypes.TEXT, allowNull: true },
  no_hp: { type: DataTypes.STRING(30), allowNull: true },
  agama: { type: DataTypes.STRING(30), allowNull: true },
  status_korban: { type: DataTypes.STRING(30), allowNull: true },
  jenis_identitas: { type: DataTypes.STRING(50), allowNull: true },
  pendidikan_terakhir: { type: DataTypes.STRING(50), allowNull: true },
  suku: { type: DataTypes.STRING(50), allowNull: true },
  jenis_kelamin: { type: DataTypes.STRING(20), allowNull: true },
}, {
  tableName: 'terlibat',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['id_laporan', 'tipe_laporan'] },
    { fields: ['keterlibatan'] },
    { fields: ['nik'] },
  ],
});

module.exports = Terlibat;
