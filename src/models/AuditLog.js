'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AuditLog = sequelize.define('AuditLog', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  request_id: { type: DataTypes.STRING(36), allowNull: true },
  user_id: { type: DataTypes.UUID, allowNull: true },
  username: { type: DataTypes.STRING(50), allowNull: true },
  role: { type: DataTypes.STRING(20), allowNull: true },
  method: { type: DataTypes.STRING(10), allowNull: false },
  path: { type: DataTypes.STRING(255), allowNull: false },
  query: { type: DataTypes.JSON, allowNull: true },
  status_code: { type: DataTypes.INTEGER, allowNull: true },
  ip: { type: DataTypes.STRING(45), allowNull: true },
  id_polda: { type: DataTypes.STRING(20), allowNull: true },
  id_polres: { type: DataTypes.STRING(20), allowNull: true },
  duration_ms: { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'audit_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false, // baris audit bersifat immutable
  indexes: [
    { fields: ['user_id'] },
    { fields: ['created_at'] },
    { fields: ['path'] },
  ],
});

module.exports = AuditLog;