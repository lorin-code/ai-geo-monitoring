const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// 定时检测任务模型
const DetectionSchedule = sequelize.define('DetectionSchedule', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  brand: { type: DataTypes.STRING, allowNull: true },
  question: { type: DataTypes.TEXT, allowNull: false },
  platforms: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  highlight_keywords: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  daily_time: { type: DataTypes.STRING, allowNull: false }, // HH:mm
  timezone: { type: DataTypes.STRING, allowNull: false, defaultValue: 'UTC' },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  last_run_at: { type: DataTypes.DATE, allowNull: true },
  next_run_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'detection_schedules',
  underscored: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['enabled'] },
    { fields: ['next_run_at'] },
  ]
});

module.exports = DetectionSchedule;