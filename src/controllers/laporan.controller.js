'use strict';

const { Op } = require('sequelize');
const { LaporanA, LaporanB, Terlibat } = require('../models');
const ApiResponse = require('../utils/apiResponse');
const { parsePagination, parseDateRange } = require('../utils/pagination');
const logger = require('../utils/logger');

/**
 * Build WHERE clause from query + scope filter
 */
const buildWhere = (query, scopeFilter) => {
  const where = { ...scopeFilter };
  const { fromDate, toDate, dateField } = parseDateRange(query);

  if (fromDate || toDate) {
    where[dateField] = {};
    if (fromDate) where[dateField][Op.gte] = fromDate;
    if (toDate) where[dateField][Op.lte] = toDate;
  }

  if (query.id_polda) where.id_polda = query.id_polda;
  if (query.id_polres) where.id_polres = query.id_polres;
  if (query.id_polsek) where.id_polsek = query.id_polsek;
  if (query.kategori_kejahatan) {
    where.nama_kategori_kejahatan = { [Op.like]: `%${query.kategori_kejahatan}%` };
  }
  if (query.provinsi) where.provinsi = { [Op.like]: `%${query.provinsi}%` };
  if (query.kabupaten) where.kabupaten = { [Op.like]: `%${query.kabupaten}%` };

  // Full-text search
  if (query.q) {
    const kw = `%${query.q}%`;
    where[Op.or] = [
      { no_laporan: { [Op.like]: kw } },
      { apa_terjadi: { [Op.like]: kw } },
      { uraian_singkat_kejadian: { [Op.like]: kw } },
      { tempat_kejadian: { [Op.like]: kw } },
      { nama_polda: { [Op.like]: kw } },
      { nama_polres: { [Op.like]: kw } },
    ];
  }

  return where;
};

const LaporanController = {
  /**
   * GET /laporan/a — LP Model A list
   */
  async indexA(req, res) {
    try {
      const { page, limit, offset, order_by, sort } = parsePagination(req.query);
      const where = buildWhere(req.query, req.scopeFilter || {});

      const { count, rows } = await LaporanA.findAndCountAll({
        where,
        order: [[order_by, sort]],
        limit,
        offset,
        attributes: { exclude: ['raw_json'] },
      });

      return ApiResponse.paginated(res, rows, { total: count, page, limit });
    } catch (error) {
      logger.error('LaporanA index error:', error);
      return ApiResponse.error(res);
    }
  },

  /**
   * GET /laporan/a/:id — LP Model A detail with terlibat
   */
  async showA(req, res) {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return ApiResponse.error(res, 'ID tidak valid', 400);

      const laporan = await LaporanA.findByPk(id);
      if (!laporan) return ApiResponse.notFound(res, 'Laporan tidak ditemukan');

      // Scope check
      if (req.scopeFilter?.id_polda && laporan.id_polda !== req.scopeFilter.id_polda) {
        return ApiResponse.forbidden(res);
      }
      if (req.scopeFilter?.id_polres && laporan.id_polres !== req.scopeFilter.id_polres) {
        return ApiResponse.forbidden(res);
      }

      const terlibat = await Terlibat.findAll({
        where: { id_laporan: id, tipe_laporan: 'a' },
      });

      return ApiResponse.success(res, { ...laporan.toJSON(), terlibat });
    } catch (error) {
      logger.error('LaporanA show error:', error);
      return ApiResponse.error(res);
    }
  },

  /**
   * GET /laporan/b — LP Model B list
   */
  async indexB(req, res) {
    try {
      const { page, limit, offset, order_by, sort } = parsePagination(req.query);
      const where = buildWhere(req.query, req.scopeFilter || {});

      const { count, rows } = await LaporanB.findAndCountAll({
        where,
        order: [[order_by, sort]],
        limit,
        offset,
        attributes: { exclude: ['raw_json'] },
      });

      return ApiResponse.paginated(res, rows, { total: count, page, limit });
    } catch (error) {
      logger.error('LaporanB index error:', error);
      return ApiResponse.error(res);
    }
  },

  /**
   * GET /laporan/b/:id
   */
  async showB(req, res) {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return ApiResponse.error(res, 'ID tidak valid', 400);

      const laporan = await LaporanB.findByPk(id);
      if (!laporan) return ApiResponse.notFound(res, 'Laporan tidak ditemukan');

      if (req.scopeFilter?.id_polda && laporan.id_polda !== req.scopeFilter.id_polda) {
        return ApiResponse.forbidden(res);
      }
      if (req.scopeFilter?.id_polres && laporan.id_polres !== req.scopeFilter.id_polres) {
        return ApiResponse.forbidden(res);
      }

      const terlibat = await Terlibat.findAll({
        where: { id_laporan: id, tipe_laporan: 'b' },
      });

      return ApiResponse.success(res, { ...laporan.toJSON(), terlibat });
    } catch (error) {
      logger.error('LaporanB show error:', error);
      return ApiResponse.error(res);
    }
  },

  /**
   * GET /laporan/search — Combined search across A & B (multi-field)
   */
  async search(req, res) {
    try {
      const { page, limit, offset } = parsePagination(req.query);
      const scope = req.scopeFilter || {};
      const q = req.query.q;

      if (!q || q.trim().length < 2) {
        return ApiResponse.error(res, 'Parameter pencarian q minimal 2 karakter', 400);
      }

      const kw = `%${q.trim()}%`;
      const searchWhere = (extra = {}) => ({
        ...scope,
        ...extra,
        [Op.or]: [
          { no_laporan: { [Op.like]: kw } },
          { apa_terjadi: { [Op.like]: kw } },
          { uraian_singkat_kejadian: { [Op.like]: kw } },
          { tempat_kejadian: { [Op.like]: kw } },
          { nama_polda: { [Op.like]: kw } },
          { nama_polres: { [Op.like]: kw } },
        ],
      });

      const [resA, resB] = await Promise.all([
        LaporanA.findAndCountAll({ where: searchWhere(), limit, offset, attributes: { exclude: ['raw_json'] } }),
        LaporanB.findAndCountAll({ where: searchWhere(), limit, offset, attributes: { exclude: ['raw_json'] } }),
      ]);

      return ApiResponse.success(res, {
        laporan_a: { total: resA.count, data: resA.rows },
        laporan_b: { total: resB.count, data: resB.rows },
        total_combined: resA.count + resB.count,
      });
    } catch (error) {
      logger.error('Search error:', error);
      return ApiResponse.error(res);
    }
  },

  /**
   * GET /laporan/by-lp — Pencarian khusus berdasarkan Nomor LP (no_laporan)
   * Mencari di LP/A & LP/B sekaligus, tetap ter-scope sesuai wilayah role.
   * Query: no_lp (wajib, min 3 karakter), exact (opsional, 'true' = persis sama)
   */
  async searchByNoLP(req, res) {
    try {
      const noLp = (req.query.no_lp || '').trim();
      if (noLp.length < 3) {
        return ApiResponse.error(res, 'Parameter no_lp minimal 3 karakter', 400);
      }

      const scope = req.scopeFilter || {};
      const exact = String(req.query.exact || '').toLowerCase() === 'true';
      const condition = exact ? noLp : { [Op.like]: `%${noLp}%` };
      const where = { ...scope, no_laporan: condition };

      const [resA, resB] = await Promise.all([
        LaporanA.findAll({
          where,
          limit: 50,
          order: [['updated_at', 'DESC']],
          attributes: { exclude: ['raw_json'] },
        }),
        LaporanB.findAll({
          where,
          limit: 50,
          order: [['updated_at', 'DESC']],
          attributes: { exclude: ['raw_json'] },
        }),
      ]);

      const results = [
        ...resA.map((r) => ({ ...r.toJSON(), tipe_laporan: 'a' })),
        ...resB.map((r) => ({ ...r.toJSON(), tipe_laporan: 'b' })),
      ];

      return ApiResponse.success(res, {
        no_lp: noLp,
        exact,
        total: results.length,
        results,
      });
    } catch (error) {
      logger.error('Search by No LP error:', error);
      return ApiResponse.error(res, 'Gagal mencari berdasarkan No LP');
    }
  },
};

module.exports = LaporanController;