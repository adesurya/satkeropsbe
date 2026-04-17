'use strict';

/**
 * Standardized API response builder
 */
class ApiResponse {
  static success(res, data = null, message = 'Success', statusCode = 200, meta = null) {
    const payload = { success: true, message };
    if (meta) payload.meta = meta;
    if (data !== null) payload.data = data;
    return res.status(statusCode).json(payload);
  }

  static paginated(res, data, pagination, message = 'Success') {
    return res.status(200).json({
      success: true,
      message,
      meta: {
        total: pagination.total,
        per_page: pagination.limit,
        current_page: pagination.page,
        last_page: Math.ceil(pagination.total / pagination.limit),
        from: (pagination.page - 1) * pagination.limit + 1,
        to: Math.min(pagination.page * pagination.limit, pagination.total),
      },
      data,
    });
  }

  static error(res, message = 'Internal Server Error', statusCode = 500, errors = null) {
    const payload = { success: false, message };
    if (errors) payload.errors = errors;
    return res.status(statusCode).json(payload);
  }

  static validationError(res, errors) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  static unauthorized(res, message = 'Unauthorized') {
    return res.status(401).json({ success: false, message });
  }

  static forbidden(res, message = 'Forbidden - Insufficient permissions') {
    return res.status(403).json({ success: false, message });
  }

  static notFound(res, message = 'Resource not found') {
    return res.status(404).json({ success: false, message });
  }
}

module.exports = ApiResponse;
