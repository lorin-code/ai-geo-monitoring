const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MembershipPlan = sequelize.define('MembershipPlan', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  level: {
    type: DataTypes.ENUM('free', 'pro', 'enterprise'),
    allowNull: false,
    unique: true
  },
  detection_daily_limit: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 10
  },
}, {
  tableName: 'membership_plans',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = MembershipPlan;