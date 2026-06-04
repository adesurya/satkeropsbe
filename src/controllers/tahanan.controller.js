'use strict';

const { Op, fn, col } = require('sequelize');
const { Tahanan } = require('../models');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const tahananService = require('../services/tahanan.service');

const DATE_FIELDS = ['updated_at', 'created_at', 'tgl_masuk', 'tgl_keluar'];
const ORDER_FIELDS = ['updated_at', 'created_at', 'tgl_masuk', 'tgl_keluar', 'nama', 'id'];

const buildWhere = (query, scopeFilter) => {
  const where = { ...scopeFilter };

  // Rentang tanggal
  const dateField = DATE_FIELDS.includes(query.date_field) ? query.date_field : 'updated_at';
  if (query.from || query.to) {
    where[dateField] = {};
    if (query.from) where[dateField][Op.gte] = `${query.from} 00:00:00`;
    if (query.to) where[dateField][Op.lte] = `${query.to} 23:59:59`;
  }

  if (query.id_polda) where.id_polda = query.id_polda;
  if (query.id_polres) where.id_polres = query.id_polres;
  if (query.tipe_tahanan) where.tipe_tahanan = query.tipe_tahanan;
  if (query.gender) where.gender = query.gender;
  if (query.id_jenis_kasus) where.id_jenis_kasus = query.id_jenis_kasus;

  // status: aktif (belum keluar) / keluar
  if (query.status === 'aktif') where.tgl_keluar = { [Op.is]: null };
  else if (query.status === 'keluar') where.tgl_keluar = { [Op.not]: null };

  if (query.q) {
    const kw = `%${query.q.trim()}%`;
    where[Op.or] = [
      { nama: { [Op.like]: kw } },
      { nik: { [Op.like]: kw } },
      { no_lp: { [Op.like]: kw } },
      { nama_jenis_kasus: { [Op.like]: kw } },
      { nama_polres: { [Op.like]: kw } },
    ];
  }

  return where;
};

const TahananController = {
  /**
   * GET /tahanan — daftar tahanan (paginated, ter-scope wilayah)
   */
  async index(req, res) {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
      const offset = (page - 1) * limit;

      const order_by = ORDER_FIELDS.includes(req.query.order_by) ? req.query.order_by : 'updated_at';
      const sort = String(req.query.sort || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      const where = buildWhere(req.query, req.scopeFilter || {});

      const { count, rows } = await Tahanan.findAndCountAll({
        where,
        order: [[order_by, sort]],
        limit,
        offset,
        attributes: { exclude: ['raw_json'] },
      });

      return ApiResponse.paginated(res, rows, { total: count, page, limit });
    } catch (error) {
      logger.error('Tahanan index error:', error);
      return ApiResponse.error(res, 'Gagal mengambil data tahanan');
    }
  },

  /**
   * GET /tahanan/:id — detail tahanan
   */
  async show(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) return ApiResponse.error(res, 'ID tidak valid', 400);

      const tahanan = await Tahanan.findByPk(id);
      if (!tahanan) return ApiResponse.notFound(res, 'Data tahanan tidak ditemukan');

      // Scope check (selaras dengan laporan)
      if (req.scopeFilter?.id_polda && tahanan.id_polda !== req.scopeFilter.id_polda) {
        return ApiResponse.forbidden(res);
      }
      if (req.scopeFilter?.id_polres && tahanan.id_polres !== req.scopeFilter.id_polres) {
        return ApiResponse.forbidden(res);
      }

      return ApiResponse.success(res, tahanan);
    } catch (error) {
      logger.error('Tahanan show error:', error);
      return ApiResponse.error(res);
    }
  },

  /**
   * GET /tahanan/stats/summary — ringkasan agregat (ter-scope)
   */
  async summary(req, res) {
    try {
      const where = buildWhere(req.query, req.scopeFilter || {});
      const baseAttrs = [[fn('COUNT', col('id')), 'total']];

      const [total, aktif, byTipe, byGender, byKasus, byPolres] = await Promise.all([
        Tahanan.count({ where }),
        Tahanan.count({ where: { ...where, tgl_keluar: { [Op.is]: null } } }),
        Tahanan.findAll({ where, attributes: ['tipe_tahanan', ...baseAttrs], group: ['tipe_tahanan'], raw: true }),
        Tahanan.findAll({ where, attributes: ['gender', ...baseAttrs], group: ['gender'], raw: true }),
        Tahanan.findAll({
          where, attributes: ['nama_jenis_kasus', ...baseAttrs],
          group: ['nama_jenis_kasus'], order: [[fn('COUNT', col('id')), 'DESC']], limit: 10, raw: true,
        }),
        Tahanan.findAll({
          where, attributes: ['id_polres', 'nama_polres', ...baseAttrs],
          group: ['id_polres', 'nama_polres'], order: [[fn('COUNT', col('id')), 'DESC']], limit: 15, raw: true,
        }),
      ]);

      return ApiResponse.success(res, {
        total,
        aktif,
        keluar: total - aktif,
        by_tipe_tahanan: byTipe,
        by_gender: byGender,
        top_jenis_kasus: byKasus,
        by_polres: byPolres,
      });
    } catch (error) {
      logger.error('Tahanan summary error:', error);
      return ApiResponse.error(res, 'Gagal mengambil ringkasan tahanan');
    }
  },

  /**
   * POST /tahanan/sync/trigger — picu sinkronisasi manual (background)
   * Query: from, to (YYYY-MM-DD), kode_polda (opsional)
   */
  async triggerSync(req, res) {
    try {
      const { from, to, kode_polda } = req.query;

      res.status(202).json({ success: true, message: 'Sinkronisasi tahanan dimulai di background', timestamp: new Date() });

      tahananService
        .sync({ from, to, kodePolda: kode_polda, triggeredBy: 'manual' })
        .catch((e) => logger.error('Manual tahanan sync error:', e.message));
    } catch (error) {
      logger.error('Trigger tahanan sync error:', error);
      if (!res.headersSent) return ApiResponse.error(res);
    }
  },

  /**
   * GET /tahanan/sync/status — ringkasan sinkronisasi terakhir
   */
  async syncStatus(req, res) {
    try {
      const last = await tahananService.getLastSync();
      return ApiResponse.success(res, last || { message: 'Belum pernah sinkronisasi' });
    } catch (error) {
      logger.error('Tahanan sync status error:', error);
      return ApiResponse.error(res);
    }
  },
};

module.exports = TahananController;