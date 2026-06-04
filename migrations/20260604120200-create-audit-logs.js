'use strict';

/**
 * Tabel audit_logs untuk akuntabilitas akses data sensitif.
 * IF NOT EXISTS → idempoten & aman terhadap sync() di dev.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`audit_logs\` (
        \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
        \`request_id\` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`user_id\` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
        \`username\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`role\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`method\` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
        \`path\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
        \`query\` json DEFAULT NULL,
        \`status_code\` int DEFAULT NULL,
        \`ip\` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`id_polda\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`id_polres\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`duration_ms\` int DEFAULT NULL,
        \`created_at\` datetime NOT NULL,
        PRIMARY KEY (\`id\`),
        KEY \`audit_logs_user_id\` (\`user_id\`),
        KEY \`audit_logs_created_at\` (\`created_at\`),
        KEY \`audit_logs_path\` (\`path\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS `audit_logs`;');
  },
};