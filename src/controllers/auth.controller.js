'use strict';

const jwt = require('jsonwebtoken');
const { User } = require('../models');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;

const generateTokens = (user) => {
  const payload = { id: user.id, role: user.role, id_polda: user.id_polda, id_polres: user.id_polres };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    issuer: 'crime-dashboard-api',
  });

  const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    issuer: 'crime-dashboard-api',
  });

  return { accessToken, refreshToken };
};

const AuthController = {
  /**
   * POST /auth/login
   */
  async login(req, res) {
    try {
      const { username, password } = req.body;

      const user = await User.findOne({ where: { username } });

      if (!user) {
        logger.warn(`Login gagal - username tidak ditemukan: ${username} [IP: ${req.ip}]`);
        return ApiResponse.unauthorized(res, 'Username atau password salah');
      }

      if (!user.is_active) {
        return ApiResponse.unauthorized(res, 'Akun nonaktif. Hubungi administrator.');
      }

      // Check account lock
      if (user.locked_until && new Date() < new Date(user.locked_until)) {
        const remaining = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
        return ApiResponse.unauthorized(res, `Akun terkunci. Coba lagi dalam ${remaining} menit.`);
      }

      const isValid = await user.comparePassword(password);

      if (!isValid) {
        const newAttempts = (user.failed_login_attempts || 0) + 1;
        const updates = { failed_login_attempts: newAttempts };

        if (newAttempts >= MAX_FAILED_ATTEMPTS) {
          updates.locked_until = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000);
          logger.warn(`Akun dikunci setelah ${MAX_FAILED_ATTEMPTS} percobaan gagal: ${username}`);
        }

        await user.update(updates);
        logger.warn(`Login gagal - password salah: ${username} [IP: ${req.ip}] (percobaan ${newAttempts})`);
        return ApiResponse.unauthorized(res, 'Username atau password salah');
      }

      // Reset failed attempts on success
      const { accessToken, refreshToken } = generateTokens(user);
      await user.update({
        failed_login_attempts: 0,
        locked_until: null,
        last_login: new Date(),
        refresh_token: refreshToken,
      });

      logger.info(`Login berhasil: ${username} [IP: ${req.ip}]`);

      return ApiResponse.success(res, {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        expires_in: process.env.JWT_EXPIRES_IN || '8h',
        user: user.toSafeJSON(),
      }, 'Login berhasil');

    } catch (error) {
      logger.error('Login error:', error);
      return ApiResponse.error(res, 'Terjadi kesalahan saat login');
    }
  },

  /**
   * POST /auth/refresh
   */
  async refreshToken(req, res) {
    try {
      const { refresh_token } = req.body;
      if (!refresh_token) return ApiResponse.unauthorized(res, 'Refresh token diperlukan');

      let decoded;
      try {
        decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
      } catch {
        return ApiResponse.unauthorized(res, 'Refresh token tidak valid atau kedaluwarsa');
      }

      const user = await User.findOne({ where: { id: decoded.id, is_active: true, refresh_token } });
      if (!user) return ApiResponse.unauthorized(res, 'Refresh token tidak cocok');

      const { accessToken, refreshToken: newRefresh } = generateTokens(user);
      await user.update({ refresh_token: newRefresh });

      return ApiResponse.success(res, {
        access_token: accessToken,
        refresh_token: newRefresh,
        token_type: 'Bearer',
      }, 'Token diperbarui');

    } catch (error) {
      logger.error('Refresh token error:', error);
      return ApiResponse.error(res, 'Gagal memperbarui token');
    }
  },

  /**
   * POST /auth/logout
   */
  async logout(req, res) {
    try {
      await req.user.update({ refresh_token: null });
      logger.info(`Logout: ${req.user.username}`);
      return ApiResponse.success(res, null, 'Logout berhasil');
    } catch (error) {
      logger.error('Logout error:', error);
      return ApiResponse.error(res, 'Gagal logout');
    }
  },

  /**
   * GET /auth/me
   */
  async me(req, res) {
    try {
      const user = await User.findByPk(req.user.id, {
        attributes: { exclude: ['password', 'refresh_token', 'failed_login_attempts', 'locked_until', 'deletedAt'] },
      });
      return ApiResponse.success(res, user);
    } catch (error) {
      return ApiResponse.error(res);
    }
  },

  /**
   * PUT /auth/change-password
   */
  async changePassword(req, res) {
    try {
      const { old_password, new_password } = req.body;
      const user = await User.findByPk(req.user.id);

      const isValid = await user.comparePassword(old_password);
      if (!isValid) return ApiResponse.error(res, 'Password lama tidak sesuai', 400);

      await user.update({ password: new_password });
      return ApiResponse.success(res, null, 'Password berhasil diubah');
    } catch (error) {
      logger.error('Change password error:', error);
      return ApiResponse.error(res);
    }
  },
};

module.exports = AuthController;
