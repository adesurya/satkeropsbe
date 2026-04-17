'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const LaporanA = sequelize.define('LaporanA', {
  id:               { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: false },
  id_satuan:        { type: DataTypes.INTEGER, allowNull: true },
  id_polda:         { type: DataTypes.STRING(20), allowNull: true },
  id_polres:        { type: DataTypes.STRING(20), allowNull: true },
  id_polsek:        { type: DataTypes.STRING(20), allowNull: true },
  id_unit_terusan:  { type: DataTypes.INTEGER, allowNull: true },

  // STRING columns yang panjangnya tidak terbatas dari API → TEXT
  no_laporan:              { type: DataTypes.TEXT, allowNull: true },
  no_sttlp:                { type: DataTypes.TEXT, allowNull: true },
  kategori:                { type: DataTypes.STRING(50), allowNull: true },
  tgl_laporan:             { type: DataTypes.STRING(30), allowNull: true },
  zona_waktu:              { type: DataTypes.STRING(10), allowNull: true },
  waktu_kejadian:          { type: DataTypes.DATE, allowNull: true },
  waktu_kejadian_faktual:  { type: DataTypes.TEXT, allowNull: true },
  tempat_kejadian:         { type: DataTypes.TEXT, allowNull: true },
  koordinat_lat:           { type: DataTypes.DECIMAL(12, 8), allowNull: true },
  koordinat_lng:           { type: DataTypes.DECIMAL(12, 8), allowNull: true },

  // Bisa berisi HTML + teks panjang → TEXT
  apa_terjadi:             { type: DataTypes.TEXT, allowNull: true },
  bagaimana_terjadi:       { type: DataTypes.TEXT('long'), allowNull: true },
  uraian_kejadian:         { type: DataTypes.TEXT('long'), allowNull: true },
  uraian_singkat_kejadian: { type: DataTypes.TEXT, allowNull: true },

  nrp_penerima:      { type: DataTypes.STRING(20), allowNull: true },
  nrp_mengetahui:    { type: DataTypes.STRING(20), allowNull: true },
  nama_mengetahui:   { type: DataTypes.STRING(150), allowNull: true },
  pangkat_mengetahui:{ type: DataTypes.STRING(50),  allowNull: true },
  nrp_pembuat:       { type: DataTypes.STRING(20), allowNull: true },
  nama_pembuat:      { type: DataTypes.STRING(150), allowNull: true },
  pangkat_pembuat:   { type: DataTypes.STRING(50),  allowNull: true },
  kerugian:          { type: DataTypes.BIGINT, defaultValue: 0 },

  id_pasal_kamtibmas:       { type: DataTypes.INTEGER, allowNull: true },
  id_kategori_lokasi:       { type: DataTypes.INTEGER, allowNull: true },
  tkp_id_provinsi:          { type: DataTypes.STRING(10), allowNull: true },
  tkp_id_kota:              { type: DataTypes.STRING(10), allowNull: true },
  tkp_id_kecamatan:         { type: DataTypes.STRING(15), allowNull: true },
  tkp_id_desa:              { type: DataTypes.STRING(15), allowNull: true },
  id_emp_sasaran_kejahatan: { type: DataTypes.INTEGER, allowNull: true },
  id_emp_modus_operandi:    { type: DataTypes.INTEGER, allowNull: true },
  id_emp_motif_kejahatan:   { type: DataTypes.INTEGER, allowNull: true },
  status_aktif:             { type: DataTypes.BOOLEAN, defaultValue: true },
  id_operasi:               { type: DataTypes.STRING(20), allowNull: true },
  dilimpahkan:              { type: DataTypes.TINYINT, defaultValue: 0 },
  pelimpahan:               { type: DataTypes.TINYINT, defaultValue: 0 },
  id_hubungan_korban_pelaku:{ type: DataTypes.INTEGER, allowNull: true },
  perhatian_publik:         { type: DataTypes.BOOLEAN, defaultValue: false },

  // Denormalized — nama bisa panjang (nama polda/polres)
  nama_polda:              { type: DataTypes.STRING(200), allowNull: true },
  nama_polres:             { type: DataTypes.STRING(200), allowNull: true },
  nama_polsek:             { type: DataTypes.STRING(200), allowNull: true },
  nama_kategori_kejahatan: { type: DataTypes.STRING(255), allowNull: true },
  nama_kategori_lokasi:    { type: DataTypes.STRING(150), allowNull: true },
  provinsi:                { type: DataTypes.STRING(100), allowNull: true },
  kabupaten:               { type: DataTypes.STRING(100), allowNull: true },
  kecamatan:               { type: DataTypes.STRING(100), allowNull: true },
  desa:                    { type: DataTypes.STRING(100), allowNull: true },

  raw_json:  { type: DataTypes.JSON, allowNull: true },
  synced_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'laporan_a',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['waktu_kejadian'] },
    { fields: ['id_polda'] },
    { fields: ['id_polres'] },
    { fields: ['nama_kategori_kejahatan'] },
    { fields: ['koordinat_lat', 'koordinat_lng'] },
    { fields: ['updated_at'] },
  ],
});

module.exports = LaporanA;