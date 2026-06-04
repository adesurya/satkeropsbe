'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Data tahanan dari API sumber Polri (/api/v1/tahanan).
 * Mengikuti pola tabel laporan: primary key memakai `id` eksternal (bukan auto-increment),
 * menyimpan `raw_json` payload asli, dan kolom scope `id_polda`/`id_polres`
 * (dipetakan dari kode_polda/kode_polres sumber) agar applyWilayahScope berlaku
 * sama seperti pada laporan.
 *
 * timestamps Sequelize dimatikan; `created_at`/`updated_at` diisi manual dari sumber
 * (konsisten dengan tabel laporan) sehingga filter rentang tanggal pada updated_at akurat.
 */
const Tahanan = sequelize.define('Tahanan', {
  id: { type: DataTypes.BIGINT, primaryKey: true, allowNull: false }, // id dari sumber
  nik: { type: DataTypes.STRING(32), allowNull: true },
  nama: { type: DataTypes.STRING(150), allowNull: true },

  id_satuan: { type: DataTypes.INTEGER, allowNull: true },

  // ── Scope wilayah (dipetakan dari kode_polda/kode_polres/kode_polsek sumber) ──
  id_polda: { type: DataTypes.STRING(20), allowNull: true },
  id_polres: { type: DataTypes.STRING(20), allowNull: true },
  id_polsek: { type: DataTypes.STRING(30), allowNull: true },
  nama_polda: { type: DataTypes.STRING(150), allowNull: true },
  nama_polres: { type: DataTypes.STRING(150), allowNull: true },
  nama_polsek: { type: DataTypes.STRING(150), allowNull: true },

  no_lp: { type: DataTypes.STRING(255), allowNull: true },

  // ── Tanggal-tanggal ──
  tgl_masuk: { type: DataTypes.DATEONLY, allowNull: true },
  tgl_keluar: { type: DataTypes.DATEONLY, allowNull: true },
  perkiraan_keluar: { type: DataTypes.DATEONLY, allowNull: true },
  tgl_lahir: { type: DataTypes.DATEONLY, allowNull: true },

  // ── Profil tahanan ──
  gender: { type: DataTypes.STRING(2), allowNull: true },
  tipe_tahanan: { type: DataTypes.STRING(20), allowNull: true },
  jenis_tahanan: { type: DataTypes.STRING(30), allowNull: true },
  kewarganegaraan: { type: DataTypes.STRING(50), allowNull: true },
  alamat: { type: DataTypes.TEXT, allowNull: true },

  // ── Kasus ──
  id_jenis_kasus: { type: DataTypes.STRING(20), allowNull: true },
  nama_jenis_kasus: { type: DataTypes.STRING(255), allowNull: true },

  // ── Penahanan ──
  lama_ditahan: { type: DataTypes.INTEGER, allowNull: true },
  lama_ditahan_1: { type: DataTypes.INTEGER, allowNull: true },
  lama_ditahan_2: { type: DataTypes.INTEGER, allowNull: true },
  lama_ditahan_3: { type: DataTypes.INTEGER, allowNull: true },
  sprin_penahanan: { type: DataTypes.STRING(255), allowNull: true },
  sprin_perpanjangan_penahanan_1: { type: DataTypes.STRING(255), allowNull: true },
  sprin_perpanjangan_penahanan_2: { type: DataTypes.STRING(255), allowNull: true },
  sprin_perpanjangan_penahanan_3: { type: DataTypes.STRING(255), allowNull: true },
  tgl_1: { type: DataTypes.DATEONLY, allowNull: true },
  tgl_2: { type: DataTypes.DATEONLY, allowNull: true },
  tgl_3: { type: DataTypes.DATEONLY, allowNull: true },
  alasan_perpanjang_1: { type: DataTypes.TEXT, allowNull: true },
  alasan_perpanjang_2: { type: DataTypes.TEXT, allowNull: true },
  alasan_perpanjang_3: { type: DataTypes.TEXT, allowNull: true },
  alasan_keluar: { type: DataTypes.STRING(255), allowNull: true },
  keterangan: { type: DataTypes.TEXT, allowNull: true },

  titip_lapas: { type: DataTypes.TINYINT, allowNull: true },
  titipan_instansi: { type: DataTypes.STRING(255), allowNull: true },
  penginput: { type: DataTypes.STRING(50), allowNull: true },

  // ── Tempat penahanan (place of detention) ──
  id_satuan_tempat: { type: DataTypes.INTEGER, allowNull: true },
  kode_polda_tempat: { type: DataTypes.STRING(20), allowNull: true },
  kode_polres_tempat: { type: DataTypes.STRING(20), allowNull: true },
  kode_polsek_tempat: { type: DataTypes.STRING(30), allowNull: true },

  // ── Timestamps sumber (diisi manual) + jejak sinkronisasi lokal ──
  created_at: { type: DataTypes.DATE, allowNull: true },
  updated_at: { type: DataTypes.DATE, allowNull: true },
  synced_at: { type: DataTypes.DATE, allowNull: true },

  raw_json: { type: DataTypes.JSON, allowNull: true },
}, {
  tableName: 'tahanan',
  timestamps: false,
  indexes: [
    { fields: ['id_polda'] },
    { fields: ['id_polres'] },
    { fields: ['updated_at'] },
    { fields: ['tgl_masuk'] },
    { fields: ['no_lp'] },
    { fields: ['nik'] },
  ],
});

module.exports = Tahanan;