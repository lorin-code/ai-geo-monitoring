const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const BrandProject = sequelize.define('BrandProject', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  name: { type: DataTypes.STRING(120), allowNull: false },
  aliases: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  website: { type: DataTypes.STRING(255), allowNull: true },
  industry: { type: DataTypes.STRING(120), allowNull: true },
  primary_keywords: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  platforms: { type: DataTypes.JSON, allowNull: false, defaultValue: ['doubao', 'deepseek'] },
  monitoring_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  monitoring_time: { type: DataTypes.STRING(5), allowNull: false, defaultValue: '09:00' },
  monitoring_last_run_at: { type: DataTypes.DATE, allowNull: true },
  monitoring_next_run_at: { type: DataTypes.DATE, allowNull: true },
  status: { type: DataTypes.ENUM('active', 'archived'), allowNull: false, defaultValue: 'active' }
}, {
  tableName: 'brand_projects',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['user_id'] },
    { fields: ['status'] }
  ]
});

module.exports = BrandProject;
