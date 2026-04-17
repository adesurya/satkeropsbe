'use strict';

const ApiResponse = require('../utils/apiResponse');

/**
 * Role hierarchy:
 *   admin    → full access to everything
 *   manager  → read all, write most (no user management)
 *   polda    → scoped to their polda
 *   polres   → scoped to their polres
 */
const ROLE_HIERARCHY = {
  admin: 4,
  manager: 3,
  polda: 2,
  polres: 1,
};

/**
 * Require one of the listed roles
 * Usage: authorize('admin', 'manager')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) return ApiResponse.unauthorized(res);
    if (!roles.includes(req.user.role)) {
      return ApiResponse.forbidden(res, `Akses ditolak. Role yang diizinkan: ${roles.join(', ')}`);
    }
    next();
  };
};

/**
 * Require minimum role level
 * Usage: requireMinRole('manager') — allows manager, admin
 */
const requireMinRole = (minRole) => {
  return (req, res, next) => {
    if (!req.user) return ApiResponse.unauthorized(res);
    const userLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const minLevel = ROLE_HIERARCHY[minRole] || 0;
    if (userLevel < minLevel) {
      return ApiResponse.forbidden(res, 'Hak akses tidak mencukupi');
    }
    next();
  };
};

/**
 * Scope filter — injects wilayah filter based on user role
 * Adds req.scopeFilter to be used in query WHERE clause
 */
const applyWilayahScope = (req, res, next) => {
  const { role, id_polda, id_polres } = req.user;
  const filter = {};

  if (role === 'polda' && id_polda) {
    filter.id_polda = id_polda;
  } else if (role === 'polres' && id_polres) {
    filter.id_polres = id_polres;
  }
  // admin and manager see everything — no filter

  req.scopeFilter = filter;
  next();
};

module.exports = { authorize, requireMinRole, applyWilayahScope };
