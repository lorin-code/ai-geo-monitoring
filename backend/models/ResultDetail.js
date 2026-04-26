const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ResultDetail = sequelize.define('ResultDetail', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  question_record_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'question_records',
      key: 'id'
    }
  },
  ai_response_original: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'AI回复原文'
  },
  parsing_status: {
    type: DataTypes.ENUM('pending', 'completed', 'failed'),
    defaultValue: 'pending'
  },
  parsing_error: {
    type: DataTypes.TEXT
  }
}, {
  tableName: 'result_details',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['question_record_id']
    }
  ]
});

module.exports = ResultDetail;