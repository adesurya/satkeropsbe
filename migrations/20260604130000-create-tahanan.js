'use strict';

/**
 * Tabel tahanan untuk menampung data dari API sumber /api/v1/tahanan.
 * IF NOT EXISTS → idempoten & aman terhadap sync() di dev.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`tahanan\` (
        \`id\` bigint NOT NULL,
        \`nik\` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`nama\` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`id_satuan\` int DEFAULT NULL,
        \`id_polda\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`id_polres\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`id_polsek\` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`nama_polda\` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`nama_polres\` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`nama_polsek\` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`no_lp\` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`tgl_masuk\` date DEFAULT NULL,
        \`tgl_keluar\` date DEFAULT NULL,
        \`perkiraan_keluar\` date DEFAULT NULL,
        \`tgl_lahir\` date DEFAULT NULL,
        \`gender\` varchar(2) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`tipe_tahanan\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`jenis_tahanan\` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`kewarganegaraan\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`alamat\` text COLLATE utf8mb4_unicode_ci,
        \`id_jenis_kasus\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`nama_jenis_kasus\` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`lama_ditahan\` int DEFAULT NULL,
        \`lama_ditahan_1\` int DEFAULT NULL,
        \`lama_ditahan_2\` int DEFAULT NULL,
        \`lama_ditahan_3\` int DEFAULT NULL,
        \`sprin_penahanan\` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`sprin_perpanjangan_penahanan_1\` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`sprin_perpanjangan_penahanan_2\` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`sprin_perpanjangan_penahanan_3\` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`tgl_1\` date DEFAULT NULL,
        \`tgl_2\` date DEFAULT NULL,
        \`tgl_3\` date DEFAULT NULL,
        \`alasan_perpanjang_1\` text COLLATE utf8mb4_unicode_ci,
        \`alasan_perpanjang_2\` text COLLATE utf8mb4_unicode_ci,
        \`alasan_perpanjang_3\` text COLLATE utf8mb4_unicode_ci,
        \`alasan_keluar\` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`keterangan\` text COLLATE utf8mb4_unicode_ci,
        \`titip_lapas\` tinyint DEFAULT NULL,
        \`titipan_instansi\` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`penginput\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`id_satuan_tempat\` int DEFAULT NULL,
        \`kode_polda_tempat\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`kode_polres_tempat\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`kode_polsek_tempat\` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`created_at\` datetime DEFAULT NULL,
        \`updated_at\` datetime DEFAULT NULL,
        \`synced_at\` datetime DEFAULT NULL,
        \`raw_json\` json DEFAULT NULL,
        PRIMARY KEY (\`id\`),
        KEY \`tahanan_id_polda\` (\`id_polda\`),
        KEY \`tahanan_id_polres\` (\`id_polres\`),
        KEY \`tahanan_updated_at\` (\`updated_at\`),
        KEY \`tahanan_tgl_masuk\` (\`tgl_masuk\`),
        KEY \`tahanan_no_lp\` (\`no_lp\`),
        KEY \`tahanan_nik\` (\`nik\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS `tahanan`;');
  },
};