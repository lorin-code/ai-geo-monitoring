const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const QuestionRecord = sequelize.define('QuestionRecord', {
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
  platform: {
    type: DataTypes.ENUM('doubao', 'deepseek', 'kimi', 'qianwen'),
    allowNull: false
  },
  brand: {
    type: DataTypes.STRING,
    allowNull: true
  },
  question: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  brand_keywords: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  detection_time: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  result_summary: {
    type: DataTypes.JSON,
    comment: '统计结果摘要，包含推荐率、曝光率等'
  },
  status: {
    type: DataTypes.ENUM('pending', 'completed', 'failed'),
    defaultValue: 'pending'
  },
  error_message: {
    type: DataTypes.TEXT
  }
}, {
  tableName: 'question_records',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['platform']
    },
    {
      fields: ['detection_time']
    }
  ]
});

module.exports = QuestionRecord;
