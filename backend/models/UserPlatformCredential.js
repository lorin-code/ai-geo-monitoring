const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('UserPlatformCredential', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  platform: { type: DataTypes.STRING(20), allowNull: false },
  encrypted_key: { type: DataTypes.TEXT, allowNull: false },
  key_suffix: { type: DataTypes.STRING(4), allowNull: false },
  model: { type: DataTypes.STRING(120), allowNull: false },
  verified_at: { type: DataTypes.DATE, allowNull: true }
}, {
  tableName: 'user_platform_credentials', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at',
  indexes: [{ unique: true, fields: ['user_id', 'platform'] }],
  defaultScope: { attributes: { exclude: ['encrypted_key'] } }
});
