const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ReportSnapshot = sequelize.define('ReportSnapshot', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  project_id: { type: DataTypes.INTEGER, allowNull: false },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  period_start: { type: DataTypes.DATE, allowNull: false },
  period_end: { type: DataTypes.DATE, allowNull: false },
  summary: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  status: { type: DataTypes.ENUM('generated'), allowNull: false, defaultValue: 'generated' }
}, {
  tableName: 'report_snapshots',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['project_id'] },
    { fields: ['user_id'] },
    { fields: ['period_start', 'period_end'] }
  ]
});

module.exports = ReportSnapshot;
