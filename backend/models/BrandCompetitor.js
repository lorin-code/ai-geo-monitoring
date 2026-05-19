const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const BrandCompetitor = sequelize.define('BrandCompetitor', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  project_id: { type: DataTypes.INTEGER, allowNull: false },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  name: { type: DataTypes.STRING(120), allowNull: false },
  aliases: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  website: { type: DataTypes.STRING(255), allowNull: true }
}, {
  tableName: 'brand_competitors',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['project_id'] },
    { fields: ['user_id'] }
  ]
});

module.exports = BrandCompetitor;
