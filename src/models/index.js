'use strict';

const { sequelize } = require('../config/database');
const User = require('./User');
const LaporanA = require('./LaporanA');
const LaporanB = require('./LaporanB');
const Terlibat = require('./Terlibat');
const ApiSetting = require('./ApiSetting');
const SyncLog = require('./SyncLog');

// No FK constraints on Terlibat - data comes from external API
// We manage integrity at the application level

const models = { User, LaporanA, LaporanB, Terlibat, ApiSetting, SyncLog, sequelize };
module.exports = models;
