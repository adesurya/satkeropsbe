'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SyncLog = sequelize.define('SyncLog', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  tipe: { type: DataTypes.ENUM('lp_a', 'lp_b'), allowNull: false },
  status: { type: DataTypes.ENUM('running', 'success', 'failed', 'partial'), defaultValue: 'running' },
  total_fetched: { type: DataTypes.INTEGER, defaultValue: 0 },
  total_inserted: { type: DataTypes.INTEGER, defaultValue: 0 },
  total_updated: { type: DataTypes.INTEGER, defaultValue: 0 },
  total_skipped: { type: DataTypes.INTEGER, defaultValue: 0 },
  error_message: { type: DataTypes.TEXT, allowNull: true },
  params_used: { type: DataTypes.JSON, allowNull: true },
  started_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  finished_at: { type: DataTypes.DATE, allowNull: true },
  duration_ms: { type: DataTypes.INTEGER, allowNull: true },
  triggered_by: { type: DataTypes.STRING(50), defaultValue: 'scheduler' },
}, {
  tableName: 'sync_logs',
  timestamps: false,
});

module.exports = SyncLog;
