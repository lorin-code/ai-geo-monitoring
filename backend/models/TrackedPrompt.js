const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TrackedPrompt = sequelize.define('TrackedPrompt', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  project_id: { type: DataTypes.INTEGER, allowNull: false },
  prompt_group_id: { type: DataTypes.INTEGER, allowNull: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  question: { type: DataTypes.TEXT, allowNull: false },
  tags: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  platforms: { type: DataTypes.JSON, allowNull: false, defaultValue: ['doubao', 'deepseek'] },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, {
  tableName: 'tracked_prompts',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['project_id'] },
    { fields: ['user_id'] },
    { fields: ['enabled'] }
  ]
});

module.exports = TrackedPrompt;
