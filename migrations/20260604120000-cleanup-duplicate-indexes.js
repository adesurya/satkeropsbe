'use strict';

/**
 * SCH-1: Bersihkan index UNIQUE duplikat yang menumpuk akibat `sync({ alter: true })`.
 * Tabel `users` punya username_2..N & email_2..N; `api_settings` punya key_2..N.
 * Migration ini IDEMPOTEN: ia membaca information_schema dan hanya men-drop
 * index duplikat yang masih ada, menyisakan satu index kanonik per kolom.
 *
 * Aman dijalankan di DB produksi: tidak menyentuh data, hanya metadata index.
 */
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;

    // Daftar (tabel, kolom, index yang DIPERTAHANKAN)
    const targets = [
      { table: 'users',        column: 'username', keep: 'username' },
      { table: 'users',        column: 'email',    keep: 'email' },
      { table: 'api_settings', column: 'key',      keep: 'key' },
    ];

    for (const t of targets) {
      const [rows] = await sequelize.query(
        `SELECT DISTINCT INDEX_NAME
           FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = :table
            AND COLUMN_NAME = :column
            AND INDEX_NAME <> 'PRIMARY'
            AND INDEX_NAME <> :keep`,
        { replacements: { table: t.table, column: t.column, keep: t.keep } }
      );

      for (const r of rows) {
        const idx = r.INDEX_NAME;
        // backtick aman karena nama index berasal dari information_schema, bukan input user
        await sequelize.query(`ALTER TABLE \`${t.table}\` DROP INDEX \`${idx}\``);
      }
    }
  },

  async down() {
    // Tidak ada rollback: kita TIDAK ingin memulihkan index duplikat.
    return Promise.resolve();
  },
};