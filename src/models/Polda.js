'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Polda = sequelize.define('Polda', {
  kode_polda: {
    type: DataTypes.STRING(20),
    primaryKey: true,
    allowNull: false,
  },
  nama_polda: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
}, {
  tableName: 'master_polda',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = Polda;