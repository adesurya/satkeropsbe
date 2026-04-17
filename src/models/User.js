'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  nama: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: { notEmpty: true, len: [2, 100] },
  },
  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: true,
      len: [3, 50],
      is: /^[a-zA-Z0-9_]+$/i,
    },
  },
  email: {
    type: DataTypes.STRING(150),
    allowNull: false,
    unique: true,
    validate: { isEmail: true },
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  role: {
    type: DataTypes.ENUM('admin', 'manager', 'polda', 'polres'),
    allowNull: false,
    defaultValue: 'polres',
  },
  id_polda: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Kode polda yang menjadi scope akses user',
  },
  id_polres: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Kode polres yang menjadi scope akses user',
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  last_login: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  refresh_token: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  failed_login_attempts: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  locked_until: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  password_changed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'users',
  paranoid: true, // soft delete
  hooks: {
    beforeCreate: async (user) => {
      const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12);
      user.password = await bcrypt.hash(user.password, salt);
      user.password_changed_at = new Date();
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12);
        user.password = await bcrypt.hash(user.password, salt);
        user.password_changed_at = new Date();
      }
    },
  },
});

User.prototype.comparePassword = async function (plain) {
  return bcrypt.compare(plain, this.password);
};

User.prototype.toSafeJSON = function () {
  const obj = this.toJSON();
  delete obj.password;
  delete obj.refresh_token;
  delete obj.failed_login_attempts;
  delete obj.locked_until;
  return obj;
};

module.exports = User;
