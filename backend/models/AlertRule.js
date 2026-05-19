const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AlertRule = sequelize.define('AlertRule', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  project_id: { type: DataTypes.INTEGER, allowNull: false },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  type: {
    type: DataTypes.ENUM('visibility_drop', 'competitor_ahead', 'negative_sentiment', 'task_failure', 'citation_gap', 'source_drop', 'platform_gap'),
    allowNull: false
  },
  threshold: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 10 },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  last_triggered_at: { type: DataTypes.DATE, allowNull: true },
  last_trigger_value: { type: DataTypes.FLOAT, allowNull: true },
  last_trigger_message: { type: DataTypes.TEXT, allowNull: true }
}, {
  tableName: 'alert_rules',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['project_id'] },
    { fields: ['user_id'] },
    { fields: ['enabled'] }
  ]
});

module.exports = AlertRule;
