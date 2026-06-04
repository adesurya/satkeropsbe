'use strict';

const { Op, QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { LaporanA, LaporanB, Terlibat } = require('../models');
const ApiResponse = require('../utils/apiResponse');
const { parsePagination, parseDateRange } = require('../utils/pagination');
const logger = require('../utils/logger');

/**
 * Build WHERE clause from query + scope filter (Sequelize Op)
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

const lastPage = (total, limit) => Math.max(1, Math.ceil(total / limit));

const LaporanController = {
  /**
   * GET /laporan/a — LP Model A list
   */
  async indexA(req, res) {
    try {
      const { page, limit, offset, order_by, sort } = parsePagination(req.query);
      const where = buildWhere(req.query, req.scopeFilter || {});
      const { count, rows } = await LaporanA.findAndCountAll({
        where, order: [[order_by, sort]], limit, offset,
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

      if (req.scopeFilter?.id_polda && laporan.id_polda !== req.scopeFilter.id_polda) {
        return ApiResponse.forbidden(res);
      }
      if (req.scopeFilter?.id_polres && laporan.id_polres !== req.scopeFilter.id_polres) {
        return ApiResponse.forbidden(res);
      }

      const terlibat = await Terlibat.findAll({ where: { id_laporan: id, tipe_laporan: 'a' } });
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
        where, order: [[order_by, sort]], limit, offset,
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

      const terlibat = await Terlibat.findAll({ where: { id_laporan: id, tipe_laporan: 'b' } });
      return ApiResponse.success(res, { ...laporan.toJSON(), terlibat });
    } catch (error) {
      logger.error('LaporanB show error:', error);
      return ApiResponse.error(res);
    }
  },

  /**
   * GET /laporan/search — Combined search across A & B (multi-field), paginated per tabel
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
        meta: {
          current_page: page,
          per_page: limit,
          total_combined: resA.count + resB.count,
        },
        laporan_a: { total: resA.count, last_page: lastPage(resA.count, limit), data: resA.rows },
        laporan_b: { total: resB.count, last_page: lastPage(resB.count, limit), data: resB.rows },
      });
    } catch (error) {
      logger.error('Search error:', error);
      return ApiResponse.error(res);
    }
  },

  /**
   * GET /laporan/by-lp — Pencarian berdasarkan Nomor LP (no_laporan), paginated.
   * Memakai UNION A & B agar pagination konsisten lintas tabel.
   * Query: no_lp (wajib, min 3), exact ('true'=persis), page, limit
   */
  async searchByNoLP(req, res) {
    try {
      const noLp = (req.query.no_lp || '').trim();
      if (noLp.length < 3) {
        return ApiResponse.error(res, 'Parameter no_lp minimal 3 karakter', 400);
      }

      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
      const offset = (page - 1) * limit; // integer, aman diinterpolasi
      const exact = String(req.query.exact || '').toLowerCase() === 'true';
      const scope = req.scopeFilter || {};

      const repl = {};
      let lpCond;
      if (exact) { repl.lp = noLp; lpCond = 'no_laporan = :lp'; }
      else { repl.lp = `%${noLp}%`; lpCond = 'no_laporan LIKE :lp'; }

      const scopeParts = [];
      if (scope.id_polda) { scopeParts.push('id_polda = :sp'); repl.sp = scope.id_polda; }
      if (scope.id_polres) { scopeParts.push('id_polres = :sr'); repl.sr = scope.id_polres; }
      const scopeCond = scopeParts.length ? `AND ${scopeParts.join(' AND ')}` : '';

      const cols = `id, no_laporan, kategori, waktu_kejadian, tempat_kejadian,
                    koordinat_lat, koordinat_lng, apa_terjadi, kerugian,
                    id_polda, id_polres, nama_polda, nama_polres,
                    nama_kategori_kejahatan, provinsi, kabupaten, updated_at`;

      const whereClause = `WHERE ${lpCond} ${scopeCond}`;

      const [cntRow] = await sequelize.query(
        `SELECT
            (SELECT COUNT(*) FROM laporan_a ${whereClause})
          + (SELECT COUNT(*) FROM laporan_b ${whereClause}) AS total`,
        { replacements: repl, type: QueryTypes.SELECT }
      );
      const total = parseInt(cntRow.total) || 0;

      const results = await sequelize.query(
        `SELECT * FROM (
            SELECT ${cols}, 'a' AS tipe_laporan FROM laporan_a ${whereClause}
            UNION ALL
            SELECT ${cols}, 'b' AS tipe_laporan FROM laporan_b ${whereClause}
         ) t
         ORDER BY updated_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
        { replacements: repl, type: QueryTypes.SELECT }
      );

      return res.status(200).json({
        success: true,
        message: 'Success',
        meta: {
          total,
          per_page: limit,
          current_page: page,
          last_page: lastPage(total, limit),
          from: total === 0 ? 0 : offset + 1,
          to: Math.min(offset + limit, total),
        },
        no_lp: noLp,
        exact,
        data: results,
      });
    } catch (error) {
      logger.error('Search by No LP error:', error);
      return ApiResponse.error(res, 'Gagal mencari berdasarkan No LP');
    }
  },
};

module.exports = LaporanController;