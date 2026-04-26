const sequelize = require('../config/database');
const User = require('./User');
const QuestionRecord = require('./QuestionRecord');
const ResultDetail = require('./ResultDetail');
const MembershipPlan = require('./MembershipPlan');
const UsageCounter = require('./UsageCounter');
const Setting = require('./Setting');
const DetectionSchedule = require('./DetectionSchedule');

// 定义关联关系
User.hasMany(QuestionRecord, {
  foreignKey: 'user_id',
  as: 'questionRecords'
});

QuestionRecord.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user'
});

QuestionRecord.hasOne(ResultDetail, {
  foreignKey: 'question_record_id',
  as: 'resultDetail'
});

ResultDetail.belongsTo(QuestionRecord, {
  foreignKey: 'question_record_id',
  as: 'questionRecord'
});

// 定时任务关联
User.hasMany(DetectionSchedule, {
  foreignKey: 'user_id',
  as: 'detectionSchedules'
});
DetectionSchedule.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user'
});

const models = {
  sequelize,
  User,
  QuestionRecord,
  ResultDetail,
  MembershipPlan,
  UsageCounter,
  Setting,
  DetectionSchedule
};

module.exports = models;