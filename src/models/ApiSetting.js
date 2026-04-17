'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ApiSetting = sequelize.define('ApiSetting', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  key: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    validate: { notEmpty: true },
  },
  value: { type: DataTypes.TEXT, allowNull: true },
  type: {
    type: DataTypes.ENUM('string', 'number', 'boolean', 'json'),
    defaultValue: 'string',
  },
  description: { type: DataTypes.STRING(255), allowNull: true },
  is_sensitive: { type: DataTypes.BOOLEAN, defaultValue: false },
  updated_by: { type: DataTypes.UUID, allowNull: true },
}, {
  tableName: 'api_settings',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = ApiSetting;
