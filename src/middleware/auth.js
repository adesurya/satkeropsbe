'use strict';

const jwt = require('jsonwebtoken');
const ApiResponse = require('../utils/apiResponse');
const { User } = require('../models');
const logger = require('../utils/logger');

/**
 * Verify JWT access token
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return ApiResponse.unauthorized(res, 'Access token diperlukan');
    }

    const token = authHeader.split(' ')[1];
    if (!token) return ApiResponse.unauthorized(res, 'Format token tidak valid');

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return ApiResponse.unauthorized(res, 'Token telah kedaluwarsa');
      }
      return ApiResponse.unauthorized(res, 'Token tidak valid');
    }

    const user = await User.findOne({
      where: { id: decoded.id, is_active: true },
      attributes: ['id', 'nama', 'username', 'email', 'role', 'id_polda', 'id_polres', 'is_active', 'locked_until'],
    });

    if (!user) return ApiResponse.unauthorized(res, 'User tidak ditemukan atau nonaktif');

    // Check if account is locked
    if (user.locked_until && new Date() < new Date(user.locked_until)) {
      return ApiResponse.unauthorized(res, 'Akun terkunci sementara. Coba lagi nanti.');
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    return ApiResponse.error(res, 'Autentikasi gagal', 500);
  }
};

module.exports = { authenticate };
