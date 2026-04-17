'use strict';

const { User } = require('../models');
const { Op } = require('sequelize');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

const SAFE_ATTRS = {
  exclude: ['password', 'refresh_token', 'failed_login_attempts', 'locked_until', 'deletedAt'],
};

const UserController = {
  /**
   * GET /users - List all users with pagination
   */
  async index(req, res) {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, parseInt(req.query.limit) || 20);
      const offset = (page - 1) * limit;

      const where = {};
      if (req.query.role) where.role = req.query.role;
      if (req.query.is_active !== undefined) where.is_active = req.query.is_active === 'true';
      if (req.query.q) {
        where[Op.or] = [
          { nama: { [Op.like]: `%${req.query.q}%` } },
          { username: { [Op.like]: `%${req.query.q}%` } },
          { email: { [Op.like]: `%${req.query.q}%` } },
        ];
      }

      // Non-admin: polda can only see polres under them
      if (req.user.role === 'polda') where.id_polda = req.user.id_polda;
      if (req.user.role === 'polres') where.id = req.user.id; // only self

      const { count, rows } = await User.findAndCountAll({
        where,
        attributes: SAFE_ATTRS,
        order: [['createdAt', 'DESC']],
        limit,
        offset,
        paranoid: true,
      });

      return ApiResponse.paginated(res, rows, { total: count, page, limit });
    } catch (error) {
      logger.error('User index error:', error);
      return ApiResponse.error(res);
    }
  },

  /**
   * GET /users/:id
   */
  async show(req, res) {
    try {
      const user = await User.findByPk(req.params.id, { attributes: SAFE_ATTRS });
      if (!user) return ApiResponse.notFound(res, 'User tidak ditemukan');

      // Scope check
      if (req.user.role === 'polda' && user.id_polda !== req.user.id_polda) {
        return ApiResponse.forbidden(res);
      }
      if (req.user.role === 'polres' && user.id !== req.user.id) {
        return ApiResponse.forbidden(res);
      }

      return ApiResponse.success(res, user);
    } catch (error) {
      logger.error('User show error:', error);
      return ApiResponse.error(res);
    }
  },

  /**
   * POST /users
   */
  async create(req, res) {
    try {
      const { nama, username, email, password, role, id_polda, id_polres, is_active } = req.body;

      // Only admin can create admin/manager
      if (['admin', 'manager'].includes(role) && req.user.role !== 'admin') {
        return ApiResponse.forbidden(res, 'Hanya admin yang dapat membuat user dengan role ini');
      }

      // Polda users can only create polres under their scope
      if (req.user.role === 'polda') {
        if (role !== 'polres' || id_polda !== req.user.id_polda) {
          return ApiResponse.forbidden(res, 'Polda hanya dapat membuat user polres di wilayahnya');
        }
      }

      const existing = await User.findOne({ where: { [Op.or]: [{ username }, { email }] } });
      if (existing) {
        const field = existing.username === username ? 'Username' : 'Email';
        return ApiResponse.error(res, `${field} sudah digunakan`, 409);
      }

      const user = await User.create({ nama, username, email, password, role, id_polda, id_polres, is_active });

      logger.info(`User dibuat: ${username} oleh ${req.user.username}`);
      return ApiResponse.success(res, user.toSafeJSON(), 'User berhasil dibuat', 201);
    } catch (error) {
      logger.error('User create error:', error);
      return ApiResponse.error(res);
    }
  },

  /**
   * PUT /users/:id
   */
  async update(req, res) {
    try {
      const user = await User.findByPk(req.params.id);
      if (!user) return ApiResponse.notFound(res, 'User tidak ditemukan');

      // Scope protection
      if (req.user.role === 'polda' && user.id_polda !== req.user.id_polda) {
        return ApiResponse.forbidden(res);
      }
      if (req.user.role === 'polres' && user.id !== req.user.id) {
        return ApiResponse.forbidden(res);
      }

      // Prevent privilege escalation
      const { role } = req.body;
      if (role && ['admin', 'manager'].includes(role) && req.user.role !== 'admin') {
        return ApiResponse.forbidden(res, 'Tidak dapat mengubah role ke admin/manager');
      }

      await user.update(req.body);
      logger.info(`User diupdate: ${user.username} oleh ${req.user.username}`);
      return ApiResponse.success(res, user.toSafeJSON(), 'User berhasil diupdate');
    } catch (error) {
      logger.error('User update error:', error);
      return ApiResponse.error(res);
    }
  },

  /**
   * DELETE /users/:id (soft delete)
   */
  async destroy(req, res) {
    try {
      if (req.params.id === req.user.id) {
        return ApiResponse.error(res, 'Tidak dapat menghapus akun sendiri', 400);
      }

      const user = await User.findByPk(req.params.id);
      if (!user) return ApiResponse.notFound(res, 'User tidak ditemukan');

      // Only admin can delete other admins
      if (user.role === 'admin' && req.user.role !== 'admin') {
        return ApiResponse.forbidden(res);
      }

      await user.destroy(); // soft delete (paranoid)
      logger.info(`User dihapus: ${user.username} oleh ${req.user.username}`);
      return ApiResponse.success(res, null, 'User berhasil dihapus');
    } catch (error) {
      logger.error('User destroy error:', error);
      return ApiResponse.error(res);
    }
  },

  /**
   * PATCH /users/:id/toggle-active
   */
  async toggleActive(req, res) {
    try {
      const user = await User.findByPk(req.params.id);
      if (!user) return ApiResponse.notFound(res, 'User tidak ditemukan');
      if (req.params.id === req.user.id) {
        return ApiResponse.error(res, 'Tidak dapat menonaktifkan akun sendiri', 400);
      }

      await user.update({ is_active: !user.is_active });
      const status = user.is_active ? 'diaktifkan' : 'dinonaktifkan';
      logger.info(`User ${status}: ${user.username} oleh ${req.user.username}`);
      return ApiResponse.success(res, user.toSafeJSON(), `User berhasil ${status}`);
    } catch (error) {
      return ApiResponse.error(res);
    }
  },

  /**
   * POST /users/:id/unlock
   */
  async unlock(req, res) {
    try {
      const user = await User.findByPk(req.params.id);
      if (!user) return ApiResponse.notFound(res, 'User tidak ditemukan');

      await user.update({ failed_login_attempts: 0, locked_until: null });
      return ApiResponse.success(res, null, 'Akun berhasil dibuka kuncinya');
    } catch (error) {
      return ApiResponse.error(res);
    }
  },
};

module.exports = UserController;
