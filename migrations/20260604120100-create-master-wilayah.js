'use strict';

/**
 * Buat tabel master wilayah. Memakai raw SQL `CREATE TABLE IF NOT EXISTS`
 * agar aman bila tabel sudah dibuat lebih dulu (oleh seed_wilayah.sql atau
 * sync() di dev). Idempoten.
 */
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`master_polda\` (
        \`kode_polda\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
        \`nama_polda\` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
        \`created_at\` datetime NOT NULL,
        \`updated_at\` datetime NOT NULL,
        PRIMARY KEY (\`kode_polda\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`master_polres\` (
        \`kode_polres\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
        \`kode_polda\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
        \`nama_polres\` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
        \`created_at\` datetime NOT NULL,
        \`updated_at\` datetime NOT NULL,
        PRIMARY KEY (\`kode_polres\`),
        KEY \`master_polres_kode_polda\` (\`kode_polda\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS `master_polres`;');
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS `master_polda`;');
  },
};