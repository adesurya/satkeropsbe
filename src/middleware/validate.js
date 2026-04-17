'use strict';

const Joi = require('joi');
const ApiResponse = require('../utils/apiResponse');

/**
 * Generic Joi schema validator factory
 * Usage: validate(schema) as middleware
 */
const validate = (schema, target = 'body') => {
  return (req, res, next) => {
    const data = target === 'body' ? req.body
      : target === 'query' ? req.query
      : req.params;

    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const errors = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message.replace(/['"]/g, ''),
      }));
      return ApiResponse.validationError(res, errors);
    }

    // Replace with sanitized, converted value
    if (target === 'body') req.body = value;
    else if (target === 'query') req.query = value;
    else req.params = value;

    next();
  };
};

// ─── Schemas ─────────────────────────────────────────────────────────────────

const schemas = {
  login: Joi.object({
    username: Joi.string().alphanum().min(3).max(50).required(),
    password: Joi.string().min(6).max(128).required(),
  }),

  createUser: Joi.object({
    nama: Joi.string().min(2).max(100).required(),
    username: Joi.string().alphanum().min(3).max(50).required(),
    email: Joi.string().email().max(150).required(),
    password: Joi.string().min(8).max(64)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .required()
      .messages({ 'string.pattern.base': 'Password harus mengandung huruf besar, kecil, angka, dan karakter spesial' }),
    role: Joi.string().valid('admin', 'manager', 'polda', 'polres').required(),
    id_polda: Joi.string().max(20).allow('', null).optional(),
    id_polres: Joi.string().max(20).allow('', null).optional(),
    is_active: Joi.boolean().default(true),
  }),

  updateUser: Joi.object({
    nama: Joi.string().min(2).max(100),
    email: Joi.string().email().max(150),
    password: Joi.string().min(8).max(64)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .optional(),
    role: Joi.string().valid('admin', 'manager', 'polda', 'polres'),
    id_polda: Joi.string().max(20).allow('', null).optional(),
    id_polres: Joi.string().max(20).allow('', null).optional(),
    is_active: Joi.boolean(),
  }),

  laporanQuery: Joi.object({
    from: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
    from_hour: Joi.string().pattern(/^\d{2}:\d{2}:\d{2}$/).optional(),
    to_hour: Joi.string().pattern(/^\d{2}:\d{2}:\d{2}$/).optional(),
    showby: Joi.string().valid('updated_at', 'created_at', 'tgl_laporan', 'waktu_kejadian').default('updated_at'),
    order_by: Joi.string().valid('updated_at', 'created_at', 'tgl_laporan', 'waktu_kejadian', 'kerugian', 'id').default('updated_at'),
    sort: Joi.string().valid('ASC', 'DESC', 'asc', 'desc').default('DESC'),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(500).default(50),
    id_polda: Joi.string().max(20).optional(),
    id_polres: Joi.string().max(20).optional(),
    id_polsek: Joi.string().max(20).optional(),
    kategori_kejahatan: Joi.string().max(150).optional(),
    provinsi: Joi.string().max(100).optional(),
    kabupaten: Joi.string().max(100).optional(),
    q: Joi.string().max(200).optional(),
  }),

  updateSetting: Joi.object({
    value: Joi.alternatives().try(
      Joi.string().max(5000),
      Joi.number(),
      Joi.boolean()
    ).required(),
    description: Joi.string().max(255).optional(),
  }),

  uuidParam: Joi.object({
    id: Joi.string().uuid().required(),
  }),
};

module.exports = { validate, schemas };
