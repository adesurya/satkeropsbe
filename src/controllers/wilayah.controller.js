'use strict';

const { Op } = require('sequelize');
const { Polda, Polres } = require('../models');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

const parsePage = (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(1000, Math.max(1, parseInt(query.limit) || 100));
  return { page, limit, offset: (page - 1) * limit };
};

// Terima beberapa kemungkinan nama parameter dari frontend agar tahan-banting.
const getFilterPolda = (query) => query.kode_polda || query.id_polda || query.polda || null;

const WilayahController = {
  /**
   * GET /wilayah/polda
   * Daftar polda, ter-scope sesuai role:
   *  - admin/manager : semua polda
   *  - polda/polres  : hanya polda milik mereka
   */
  async listPolda(req, res) {
    try {
      const { page, limit, offset } = parsePage(req.query);
      const { role, id_polda } = req.user;
      const where = {};

      if (role === 'polda' || role === 'polres') {
        if (!id_polda) return ApiResponse.success(res, [], 'Tidak ada wilayah', 200, { total: 0 });
        where.kode_polda = id_polda;
      }

      if (req.query.q) {
        const kw = `%${req.query.q.trim()}%`;
        where[Op.or] = [
          { kode_polda: { [Op.like]: kw } },
          { nama_polda: { [Op.like]: kw } },
        ];
      }

      const { count, rows } = await Polda.findAndCountAll({
        where,
        order: [['kode_polda', 'ASC']],
        limit,
        offset,
      });

      return ApiResponse.paginated(res, rows, { total: count, page, limit });
    } catch (error) {
      logger.error('listPolda error:', error);
      return ApiResponse.error(res, 'Gagal mengambil data polda');
    }
  },

  /**
   * GET /wilayah/polres
   * Query: kode_polda | id_polda (opsional), q (opsional), page, limit
   * Scope per role:
   *  - admin/manager : semua polres (boleh difilter kode_polda)
   *  - polda         : hanya polres di bawah polda mereka (dikunci, query diabaikan)
   *  - polres        : hanya polres milik mereka
   */
  async listPolres(req, res) {
    try {
      const { page, limit, offset } = parsePage(req.query);
      const { role, id_polda, id_polres } = req.user;
      const where = {};

      // PERBAIKAN: baca filter dari kode_polda ATAU id_polda (sebelumnya hanya id_polda,
      // sehingga frontend yang mengirim ?kode_polda=... diabaikan → semua polres tampil).
      const filterPolda = getFilterPolda(req.query);

      if (role === 'admin' || role === 'manager') {
        if (filterPolda) where.kode_polda = filterPolda;
      } else if (role === 'polda') {
        if (!id_polda) return ApiResponse.success(res, [], 'Tidak ada wilayah', 200, { total: 0 });
        where.kode_polda = id_polda; // dikunci ke polda sendiri, abaikan query
      } else if (role === 'polres') {
        if (!id_polres) return ApiResponse.success(res, [], 'Tidak ada wilayah', 200, { total: 0 });
        where.kode_polres = id_polres;
      }

      if (req.query.q) {
        const kw = `%${req.query.q.trim()}%`;
        where[Op.and] = [{
          [Op.or]: [
            { kode_polres: { [Op.like]: kw } },
            { nama_polres: { [Op.like]: kw } },
          ],
        }];
      }

      const { count, rows } = await Polres.findAndCountAll({
        where,
        order: [['kode_polres', 'ASC']],
        limit,
        offset,
      });

      return ApiResponse.paginated(res, rows, { total: count, page, limit });
    } catch (error) {
      logger.error('listPolres error:', error);
      return ApiResponse.error(res, 'Gagal mengambil data polres');
    }
  },
};

module.exports = WilayahController;