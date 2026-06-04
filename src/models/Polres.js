'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Polres = sequelize.define('Polres', {
  kode_polres: {
    type: DataTypes.STRING(20),
    primaryKey: true,
    allowNull: false,
  },
  kode_polda: {
    type: DataTypes.STRING(20),
    allowNull: false,
  },
  nama_polres: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
}, {
  tableName: 'master_polres',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['kode_polda'] },
  ],
});

module.exports = Polres;