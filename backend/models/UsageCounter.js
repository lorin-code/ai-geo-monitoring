const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UsageCounter = sequelize.define('UsageCounter', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  feature: {
    type: DataTypes.ENUM('detection'),
    allowNull: false
  },
  period: {
    type: DataTypes.ENUM('daily', 'monthly'),
    allowNull: false
  },
  used_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  period_start: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'usage_counters',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['user_id', 'feature', 'period'], unique: true }
  ]
});

module.exports = UsageCounter;