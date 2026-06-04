'use strict';

const { Op } = require('sequelize');
const { AuditLog } = require('../models');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

const AuditController = {
  /**
   * GET /audit/logs
   * Filter: user_id, username, role, method, path (LIKE), status_code,
   *         from, to (YYYY-MM-DD pada created_at). Pagination: page, limit.
   */
  async index(req, res) {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
      const offset = (page - 1) * limit;

      const where = {};
      if (req.query.user_id) where.user_id = req.query.user_id;
      if (req.query.username) where.username = { [Op.like]: `%${req.query.username}%` };
      if (req.query.role) where.role = req.query.role;
      if (req.query.method) where.method = req.query.method.toUpperCase();
      if (req.query.status_code) where.status_code = parseInt(req.query.status_code, 10);
      if (req.query.path) where.path = { [Op.like]: `%${req.query.path}%` };

      if (req.query.from || req.query.to) {
        where.created_at = {};
        if (req.query.from) where.created_at[Op.gte] = `${req.query.from} 00:00:00`;
        if (req.query.to) where.created_at[Op.lte] = `${req.query.to} 23:59:59`;
      }

      const { count, rows } = await AuditLog.findAndCountAll({
        where,
        order: [['created_at', 'DESC']],
        limit,
        offset,
      });

      return ApiResponse.paginated(res, rows, { total: count, page, limit });
    } catch (error) {
      logger.error('Audit index error:', error);
      return ApiResponse.error(res, 'Gagal mengambil audit log');
    }
  },
};

module.exports = AuditController;