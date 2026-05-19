const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const VisibilityMetric = sequelize.define('VisibilityMetric', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  project_id: { type: DataTypes.INTEGER, allowNull: false },
  prompt_id: { type: DataTypes.INTEGER, allowNull: true },
  question_record_id: { type: DataTypes.INTEGER, allowNull: false },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  platform: { type: DataTypes.ENUM('doubao', 'deepseek', 'kimi', 'qianwen'), allowNull: false },
  brand_mentioned: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  brand_mentions: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  brand_position: { type: DataTypes.INTEGER, allowNull: true },
  brand_rank: { type: DataTypes.INTEGER, allowNull: true },
  brand_recommended: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  visibility_score: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  competitor_mentions: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  share_of_voice: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  citation_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  owned_citation_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  competitor_citation_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  citation_sources: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  prompt_category: { type: DataTypes.STRING(80), allowNull: true },
  sentiment: { type: DataTypes.ENUM('positive', 'neutral', 'negative'), allowNull: false, defaultValue: 'neutral' },
  sentiment_reason: { type: DataTypes.STRING(80), allowNull: true },
  sentiment_risk_terms: { type: DataTypes.JSON, allowNull: false, defaultValue: [] }
}, {
  tableName: 'visibility_metrics',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['project_id'] },
    { fields: ['prompt_id'] },
    { fields: ['question_record_id'], unique: true },
    { fields: ['user_id'] },
    { fields: ['platform'] }
  ]
});

module.exports = VisibilityMetric;
