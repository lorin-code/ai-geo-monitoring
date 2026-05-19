const sequelize = require('../config/database');
const User = require('./User');
const QuestionRecord = require('./QuestionRecord');
const ResultDetail = require('./ResultDetail');
const MembershipPlan = require('./MembershipPlan');
const UsageCounter = require('./UsageCounter');
const Setting = require('./Setting');
const DetectionSchedule = require('./DetectionSchedule');
const BrandProject = require('./BrandProject');
const BrandCompetitor = require('./BrandCompetitor');
const PromptGroup = require('./PromptGroup');
const TrackedPrompt = require('./TrackedPrompt');
const VisibilityMetric = require('./VisibilityMetric');
const AlertRule = require('./AlertRule');
const ReportSnapshot = require('./ReportSnapshot');

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

User.hasMany(BrandProject, { foreignKey: 'user_id', as: 'brandProjects' });
BrandProject.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

BrandProject.hasMany(BrandCompetitor, { foreignKey: 'project_id', as: 'competitors' });
BrandCompetitor.belongsTo(BrandProject, { foreignKey: 'project_id', as: 'project' });

BrandProject.hasMany(PromptGroup, { foreignKey: 'project_id', as: 'promptGroups' });
PromptGroup.belongsTo(BrandProject, { foreignKey: 'project_id', as: 'project' });

BrandProject.hasMany(TrackedPrompt, { foreignKey: 'project_id', as: 'trackedPrompts' });
TrackedPrompt.belongsTo(BrandProject, { foreignKey: 'project_id', as: 'project' });
PromptGroup.hasMany(TrackedPrompt, { foreignKey: 'prompt_group_id', as: 'trackedPrompts' });
TrackedPrompt.belongsTo(PromptGroup, { foreignKey: 'prompt_group_id', as: 'group' });

BrandProject.hasMany(VisibilityMetric, { foreignKey: 'project_id', as: 'visibilityMetrics' });
VisibilityMetric.belongsTo(BrandProject, { foreignKey: 'project_id', as: 'project' });
TrackedPrompt.hasMany(VisibilityMetric, { foreignKey: 'prompt_id', as: 'visibilityMetrics' });
VisibilityMetric.belongsTo(TrackedPrompt, { foreignKey: 'prompt_id', as: 'prompt' });
QuestionRecord.hasOne(VisibilityMetric, { foreignKey: 'question_record_id', as: 'visibilityMetric' });
VisibilityMetric.belongsTo(QuestionRecord, { foreignKey: 'question_record_id', as: 'questionRecord' });

BrandProject.hasMany(AlertRule, { foreignKey: 'project_id', as: 'alertRules' });
AlertRule.belongsTo(BrandProject, { foreignKey: 'project_id', as: 'project' });

BrandProject.hasMany(ReportSnapshot, { foreignKey: 'project_id', as: 'reportSnapshots' });
ReportSnapshot.belongsTo(BrandProject, { foreignKey: 'project_id', as: 'project' });

const models = {
  sequelize,
  User,
  QuestionRecord,
  ResultDetail,
  MembershipPlan,
  UsageCounter,
  Setting,
  DetectionSchedule,
  BrandProject,
  BrandCompetitor,
  PromptGroup,
  TrackedPrompt,
  VisibilityMetric,
  AlertRule,
  ReportSnapshot
};

module.exports = models;
