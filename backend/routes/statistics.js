const express = require('express');
const router = express.Router();
const { sequelize, QuestionRecord, User, VisibilityMetric } = require('../models');
const { Op } = require('sequelize');
const { adminRequired, authRequired } = require('../middleware/auth');
const AccessControlService = require('../services/AccessControlService');
const StatisticsService = require('../services/StatisticsService');
const ProjectMetricsService = require('../services/ProjectMetricsService');

const MAINLAND_MONITORING_PLATFORMS = ['doubao', 'deepseek'];

function ensureUserScopedAccess(req, res, userId) {
  if (AccessControlService.canAccessUser(req.user, userId)) return true;
  res.status(403).json({ success: false, message: '无权访问' });
  return false;
}

function withMainlandPlatformScope(where = {}) {
  return {
    ...where,
    platform: { [Op.in]: MAINLAND_MONITORING_PLATFORMS }
  };
}

// 管理员概览统计：用户总数、今日所有用户检测次数、累计所有检测次数
router.get('/overview', adminRequired, async (req, res) => {
  try {
    const totalUsers = await User.count();
    const totalDetections = await QuestionRecord.count({
      where: withMainlandPlatformScope()
    });

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const endOfYesterday = new Date(startOfToday);
    const todayDetections = await QuestionRecord.count({
      where: withMainlandPlatformScope({ created_at: { [Op.gte]: startOfToday } })
    });

    const yesterdayDetections = await QuestionRecord.count({
      where: withMainlandPlatformScope({ created_at: { [Op.between]: [startOfYesterday, endOfYesterday] } })
    });

    const todayCompleted = await QuestionRecord.count({
      where: withMainlandPlatformScope({ status: 'completed', created_at: { [Op.gte]: startOfToday } })
    });
    const todayFailed = await QuestionRecord.count({
      where: withMainlandPlatformScope({ status: 'failed', created_at: { [Op.gte]: startOfToday } })
    });

    const platformDistributionToday = await QuestionRecord.findAll({
      where: withMainlandPlatformScope({ created_at: { [Op.gte]: startOfToday } }),
      attributes: ['platform', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      group: ['platform'],
      order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']]
    });

    // 近7天趋势（包含今天，按天统计）
    const trend7d = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(startOfToday);
      dayStart.setDate(dayStart.getDate() - i);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const count = await QuestionRecord.count({
        where: withMainlandPlatformScope({ created_at: { [Op.between]: [dayStart, dayEnd] } })
      });
      const label = `${dayStart.getMonth() + 1}-${String(dayStart.getDate()).padStart(2, '0')}`;
      trend7d.push({ date: label, count });
    }

    res.json({
      success: true,
      data: {
        total_users: totalUsers,
        today_detections: todayDetections,
        total_detections: totalDetections,
        yesterday_detections: yesterdayDetections,
        today_completed: todayCompleted,
        today_failed: todayFailed,
        today_success_rate: todayDetections > 0 ? Number(((todayCompleted / todayDetections) * 100).toFixed(2)) : 0,
        platform_distribution_today: platformDistributionToday.map(r => ({ platform: r.platform, count: Number(r.get('count')) })),
        trend_7d: trend7d
      }
    });
  } catch (error) {
    console.error('获取管理员概览统计失败:', error);
    res.status(500).json({ success: false, message: '获取管理员概览统计失败' });
  }
});

// 获取用户统计数据
router.get('/user/:userId', authRequired, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!ensureUserScopedAccess(req, res, userId)) return;
    const { startDate, endDate } = req.query;

    const whereClause = { user_id: userId };
    if (startDate && endDate) {
      whereClause.created_at = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    // 总检测次数
    const totalDetections = await QuestionRecord.count({
      where: withMainlandPlatformScope(whereClause)
    });

    // 成功检测次数
    const successfulDetections = await QuestionRecord.count({
      where: withMainlandPlatformScope({
        ...whereClause,
        status: 'completed'
      })
    });

    // 平台分布统计
    const platformStats = await QuestionRecord.findAll({
      where: withMainlandPlatformScope(whereClause),
      attributes: [
        'platform',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['platform'],
      order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']]
    });

    const metricWhereClause = { user_id: userId };
    if (startDate && endDate) {
      metricWhereClause.created_at = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }
    const visibilityMetrics = await VisibilityMetric.findAll({
      where: withMainlandPlatformScope(metricWhereClause),
      attributes: ['brand_mentioned', 'brand_recommended', 'brand_mentions']
    });

    res.json({
      success: true,
      data: {
        total_detections: totalDetections,
        successful_detections: successfulDetections,
        success_rate: totalDetections > 0 ? (successfulDetections / totalDetections * 100).toFixed(2) : 0,
        platform_distribution: platformStats,
        average_stats: StatisticsService.buildUserAverageStats(visibilityMetrics)
      }
    });

  } catch (error) {
    console.error('获取用户统计数据失败:', error);
    res.status(500).json({
      success: false,
      message: '获取用户统计数据失败'
    });
  }
});

// 获取品牌关键词统计
router.get('/keywords/:userId', authRequired, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!ensureUserScopedAccess(req, res, userId)) return;
    const { startDate, endDate } = req.query;

    const whereClause = { user_id: userId };
    if (startDate && endDate) {
      whereClause.created_at = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    // 获取所有品牌关键词
    const records = await QuestionRecord.findAll({
      where: withMainlandPlatformScope(whereClause),
      attributes: ['brand_keywords', 'platform', 'created_at', 'result_summary'],
      include: [{
        model: VisibilityMetric,
        as: 'visibilityMetric',
        attributes: ['brand_mentioned', 'brand_recommended', 'brand_mentions'],
        required: false
      }]
    });

    res.json({
      success: true,
      data: StatisticsService.buildKeywordStats(records)
    });

  } catch (error) {
    console.error('获取品牌关键词统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取品牌关键词统计失败'
    });
  }
});

// 获取平台对比统计
router.get('/platform-comparison/:userId', authRequired, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!ensureUserScopedAccess(req, res, userId)) return;
    const { startDate, endDate } = req.query;

    const whereClause = { user_id: userId };
    if (startDate && endDate) {
      whereClause.created_at = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    const platformComparison = await QuestionRecord.findAll({
      where: withMainlandPlatformScope(whereClause),
      attributes: [
        'platform',
        [sequelize.fn('COUNT', sequelize.col('question_records.id')), 'total_records']
      ],
      group: ['platform'],
      order: [[sequelize.fn('COUNT', sequelize.col('question_records.id')), 'DESC']]
    });

    res.json({
      success: true,
      data: platformComparison
    });

  } catch (error) {
    console.error('获取平台对比统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取平台对比统计失败'
    });
  }
});

// 获取趋势分析数据
router.get('/trends/:userId', authRequired, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!ensureUserScopedAccess(req, res, userId)) return;
    const { periodStart, periodEnd } = ProjectMetricsService.buildPeriodWindow(req.query.days);

    const trendData = await QuestionRecord.findAll({
      where: withMainlandPlatformScope({
        user_id: userId,
        created_at: {
          [Op.between]: [periodStart, periodEnd]
        }
      }),
      attributes: [
        [sequelize.fn('DATE', sequelize.col('question_records.created_at')), 'date'],
        [sequelize.fn('COUNT', sequelize.col('question_records.id')), 'total_detections']
      ],
      include: [],
      group: [sequelize.fn('DATE', sequelize.col('question_records.created_at'))],
      order: [[sequelize.fn('DATE', sequelize.col('question_records.created_at')), 'ASC']]
    });

    res.json({
      success: true,
      data: trendData
    });

  } catch (error) {
    console.error('获取趋势分析数据失败:', error);
    res.status(500).json({
      success: false,
      message: '获取趋势分析数据失败'
    });
  }
});

module.exports = router;
