const express = require('express');
const router = express.Router();
const { sequelize, QuestionRecord, ResultDetail, User } = require('../models');
const { Op } = require('sequelize');
const { adminRequired, authRequired } = require('../middleware/auth');

// 管理员概览统计：用户总数、今日所有用户检测次数、累计所有检测次数
router.get('/overview', adminRequired, async (req, res) => {
  try {
    const totalUsers = await User.count();
    const totalDetections = await QuestionRecord.count();

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const endOfYesterday = new Date(startOfToday);
    const todayDetections = await QuestionRecord.count({
      where: { created_at: { [Op.gte]: startOfToday } }
    });

    const yesterdayDetections = await QuestionRecord.count({
      where: { created_at: { [Op.between]: [startOfYesterday, endOfYesterday] } }
    });

    const todayCompleted = await QuestionRecord.count({
      where: { status: 'completed', created_at: { [Op.gte]: startOfToday } }
    });
    const todayFailed = await QuestionRecord.count({
      where: { status: 'failed', created_at: { [Op.gte]: startOfToday } }
    });

    const platformDistributionToday = await QuestionRecord.findAll({
      where: { created_at: { [Op.gte]: startOfToday } },
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
        where: { created_at: { [Op.between]: [dayStart, dayEnd] } }
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
    res.status(500).json({ success: false, message: '获取管理员概览统计失败', error: error.message });
  }
});

// 获取用户统计数据
router.get('/user/:userId', authRequired, async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    const whereClause = { user_id: userId };
    if (startDate && endDate) {
      whereClause.created_at = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    // 总检测次数
    const totalDetections = await QuestionRecord.count({
      where: whereClause
    });

    // 成功检测次数
    const successfulDetections = await QuestionRecord.count({
      where: {
        ...whereClause,
        status: 'completed'
      }
    });

    // 平台分布统计
    const platformStats = await QuestionRecord.findAll({
      where: whereClause,
      attributes: [
        'platform',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['platform'],
      order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']]
    });

    // 平均推荐率与曝光率占位（当前未存储相关字段，返回 0）
    const avgStats = {
      avg_recommendation_rate: 0,
      avg_exposure_rate: 0,
      avg_recommendation_count: 0
    };

    res.json({
      success: true,
      data: {
        total_detections: totalDetections,
        successful_detections: successfulDetections,
        success_rate: totalDetections > 0 ? (successfulDetections / totalDetections * 100).toFixed(2) : 0,
        platform_distribution: platformStats,
        average_stats: avgStats
      }
    });

  } catch (error) {
    console.error('获取用户统计数据失败:', error);
    res.status(500).json({
      success: false,
      message: '获取用户统计数据失败',
      error: error.message
    });
  }
});

// 获取品牌关键词统计
router.get('/keywords/:userId', authRequired, async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    const whereClause = { user_id: userId };
    if (startDate && endDate) {
      whereClause.created_at = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    // 获取所有品牌关键词
    const records = await QuestionRecord.findAll({
      where: whereClause,
      attributes: ['brand_keywords', 'platform', 'created_at'],
      include: [{
        model: ResultDetail,
        attributes: ['recommendation_count', 'exposure_rate', 'recommendation_rate'],
        where: { parsing_status: 'completed' },
        required: false
      }]
    });

    const keywordStats = {};

    records.forEach(record => {
      const keywords = record.brand_keywords.split(',').map(k => k.trim());
      
      keywords.forEach(keyword => {
        if (!keywordStats[keyword]) {
          keywordStats[keyword] = {
            keyword,
            total_mentions: 0,
            total_recommendations: 0,
            avg_exposure_rate: 0,
            avg_recommendation_rate: 0,
            platform_distribution: {},
            records: []
          };
        }

        const stats = keywordStats[keyword];
        stats.total_mentions++;
        
        if (record.resultDetail) {
          stats.total_recommendations += record.resultDetail.recommendation_count || 0;
          stats.avg_exposure_rate += record.resultDetail.exposure_rate || 0;
          stats.avg_recommendation_rate += record.resultDetail.recommendation_rate || 0;
        }

        // 平台分布
        if (!stats.platform_distribution[record.platform]) {
          stats.platform_distribution[record.platform] = 0;
        }
        stats.platform_distribution[record.platform]++;

        stats.records.push({
          platform: record.platform,
          date: record.created_at,
          recommendation_count: record.resultDetail?.recommendation_count || 0,
          exposure_rate: record.resultDetail?.exposure_rate || 0,
          recommendation_rate: record.resultDetail?.recommendation_rate || 0
        });
      });
    });

    // 计算平均值
    Object.values(keywordStats).forEach(stats => {
      if (stats.total_mentions > 0) {
        stats.avg_exposure_rate = (stats.avg_exposure_rate / stats.total_mentions).toFixed(2);
        stats.avg_recommendation_rate = (stats.avg_recommendation_rate / stats.total_mentions).toFixed(2);
      }
    });

    res.json({
      success: true,
      data: Object.values(keywordStats)
    });

  } catch (error) {
    console.error('获取品牌关键词统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取品牌关键词统计失败',
      error: error.message
    });
  }
});

// 获取平台对比统计
router.get('/platform-comparison/:userId', authRequired, async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    const whereClause = { user_id: userId };
    if (startDate && endDate) {
      whereClause.created_at = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    const platformComparison = await QuestionRecord.findAll({
      where: whereClause,
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
      message: '获取平台对比统计失败',
      error: error.message
    });
  }
});

// 获取趋势分析数据
router.get('/trends/:userId', authRequired, async (req, res) => {
  try {
    const { userId } = req.params;
    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const trendData = await QuestionRecord.findAll({
      where: {
        user_id: userId,
        created_at: {
          [Op.gte]: startDate
        }
      },
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
      message: '获取趋势分析数据失败',
      error: error.message
    });
  }
});

module.exports = router;