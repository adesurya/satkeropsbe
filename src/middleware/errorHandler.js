'use strict';

const logger = require('../utils/logger');
const ApiResponse = require('../utils/apiResponse');

const errorHandler = (err, req, res, next) => {
  logger.error({
    message: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    user: req.user?.id || 'unauthenticated',
  });

  // Sequelize validation error
  if (err.name === 'SequelizeValidationError') {
    const errors = err.errors.map((e) => ({ field: e.path, message: e.message }));
    return ApiResponse.validationError(res, errors);
  }

  // Sequelize unique constraint
  if (err.name === 'SequelizeUniqueConstraintError') {
    const field = err.errors[0]?.path || 'field';
    return ApiResponse.error(res, `${field} sudah digunakan`, 409);
  }

  // Sequelize connection error
  if (err.name === 'SequelizeConnectionError') {
    return ApiResponse.error(res, 'Database tidak tersedia', 503);
  }

  // JWT errors (should be caught in middleware, but just in case)
  if (err.name === 'JsonWebTokenError') {
    return ApiResponse.unauthorized(res, 'Token tidak valid');
  }

  // Default: 500
  const message =
    process.env.NODE_ENV === 'production'
      ? 'Terjadi kesalahan pada server'
      : err.message || 'Internal Server Error';

  return ApiResponse.error(res, message, err.status || 500);
};

const notFoundHandler = (req, res) => {
  return ApiResponse.notFound(res, `Route ${req.method} ${req.originalUrl} tidak ditemukan`);
};

module.exports = { errorHandler, notFoundHandler };
