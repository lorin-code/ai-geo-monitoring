const express = require('express');
const router = express.Router();
const axios = require('axios');
const https = require('https');
let HttpsProxyAgent;
try { HttpsProxyAgent = require('https-proxy-agent'); } catch (_) { }
const { QuestionRecord, ResultDetail, User, sequelize } = require('../models');
const { checkQuota, bulkConsumeQuota } = require('../middleware/quota');
const { authRequired, adminRequired } = require('../middleware/auth');
const { Op } = require('sequelize');
const AIPlatformService = require('../services/AIPlatformService');
const ResultParserService = require('../services/ResultParserService');

// 获取所有已使用的品牌列表（用于筛选）
router.get('/brands', authRequired, async (req, res) => {
  try {
    const where = {
      brand: { [Op.ne]: null }
    };

    // 非管理员只能看自己的品牌
    if (req.user && req.user.role !== 'admin') {
      where.user_id = req.user.id;
    }

    const brands = await QuestionRecord.findAll({
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('brand')), 'brand']],
      where,
      order: [['brand', 'ASC']]
    });

    const list = brands.map(b => b.brand).filter(b => b && String(b).trim() !== '');
    res.json({ success: true, data: list });
  } catch (error) {
    console.error('获取品牌列表失败:', error);
    res.status(500).json({ success: false, message: '获取品牌列表失败', error: error.message });
  }
});

// 统计关键词出现次数（英文关键词使用词边界）
function countKeywordOccurrences(text, keywords, englishWordBoundary = true) {
  const s = typeof text === 'string' ? text : String(text || '');
  const list = Array.isArray(keywords) ? keywords.filter(Boolean) : [];
  const escape = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return list.map((kw) => {
    const e = escape(String(kw));
    const useBoundary = englishWordBoundary && /^[A-Za-z]+$/.test(String(kw));
    const re = new RegExp(useBoundary ? `\\b${e}\\b` : e, 'gi');
    let c = 0;
    for (const _ of s.matchAll(re)) c += 1;
    return { keyword: String(kw), count: c };
  }).filter(item => item.count > 0);
}

// 创建检测任务
router.post('/create', authRequired, async (req, res) => {
  try {
    let { user_id, platforms, question, brand, brand_keywords, highlightKeywords, highlight_keywords } = req.body;

    // 仅要求问题必填；其他参数提供默认值以简化调用
    if (!question || (typeof question === 'string' && question.trim() === '')) {
      return res.status(400).json({
        success: false,
        message: '问题不能为空'
      });
    }

    // 使用登录用户ID（已通过 authRequired 中间件验证）
    user_id = req.user.id;

    // 规范化与校验平台列表：仅保留合法且已配置可用的平台
    // 兼容 string / array，并统一为小写、去重
    let hasExplicitSelection = Array.isArray(platforms) || typeof platforms === 'string';
    if (typeof platforms === 'string') {
      platforms = platforms.split(',').map(s => String(s).trim().toLowerCase()).filter(Boolean);
    }
    // 仅当数组非空或字符串非空时视为显式选择
    hasExplicitSelection = (Array.isArray(platforms) && platforms.length > 0);
    if (hasExplicitSelection) {
      const validKeys = Object.keys(AIPlatformService.platforms || {});
      const available = new Set(AIPlatformService.getAvailablePlatforms());
      platforms = Array.from(new Set(platforms.map(p => String(p).toLowerCase())))
        .filter(p => validKeys.includes(p))
        .filter(p => available.has(p));
    }

    // 若用户显式选择，但筛选后为空，直接报错，避免误用其他平台
    if (hasExplicitSelection && platforms.length === 0) {
      return res.status(400).json({
        success: false,
        message: '所选平台不可用或未配置 API Key'
      });
    }

    // 若未显式选择平台，使用当前可用平台列表
    if (!hasExplicitSelection) {
      const availableList = AIPlatformService.getAvailablePlatforms();
      if (!Array.isArray(availableList) || availableList.length === 0) {
        return res.status(400).json({
          success: false,
          message: '当前没有可用的AI平台'
        });
      }
      platforms = availableList;
    }

    // 归一化关键词（可从 brand_keywords 或 highlightKeywords 接收）
    let brandKeywordsStr = '';
    if (Array.isArray(brand_keywords)) {
      brandKeywordsStr = brand_keywords.map(s => String(s || '').trim()).filter(Boolean).join(',');
    } else if (typeof brand_keywords === 'string') {
      brandKeywordsStr = brand_keywords;
    } else if (Array.isArray(highlightKeywords)) {
      brandKeywordsStr = highlightKeywords.map(s => String(s || '').trim()).filter(Boolean).join(',');
    } else if (Array.isArray(highlight_keywords)) {
      brandKeywordsStr = highlight_keywords.map(s => String(s || '').trim()).filter(Boolean).join(',');
    }

    // 按平台数量进行配额扣减（一次请求可能创建多个任务）
    const ok = await bulkConsumeQuota(req, res, 'detection', Array.isArray(platforms) ? platforms.length : 0);
    if (!ok) return; // bulkConsumeQuota 已写入响应

    const results = [];

    for (const platform of platforms) {
      // 创建问题记录
      const questionRecord = await QuestionRecord.create({
        user_id,
        platform,
        question,
        brand: brand ? String(brand).trim() : null,
        // 保存本次任务的关键词（用于前端历史高亮与计数）
        brand_keywords: brandKeywordsStr || ''
      });

      // 异步处理AI查询
      processAIQuery(questionRecord.id, platform, question);

      results.push({
        record_id: questionRecord.id,
        platform,
        status: 'pending'
      });
    }

    res.json({
      success: true,
      message: '检测任务创建成功',
      data: {
        task_count: results.length,
        results
      }
    });

  } catch (error) {
    console.error('创建检测任务失败:', error);
    res.status(500).json({
      success: false,
      message: '创建检测任务失败',
      error: error.message
    });
  }
});

// 异步处理AI查询
async function processAIQuery(recordId, platform, question) {
  try {
    // 调用AI平台API
    const aiResult = await AIPlatformService.queryPlatform(platform, question);

    if (!aiResult.success) {
      await QuestionRecord.update(
        {
          status: 'failed',
          error_message: aiResult.error
        },
        { where: { id: recordId } }
      );
      return;
    }

    // 仅保存原始回答文本
    const originalText = ResultParserService.extractResponseText(aiResult.data);
    await ResultDetail.create({
      question_record_id: recordId,
      ai_response_original: originalText,
      parsing_status: 'completed'
    });

    // 读取记录以获取关键词，并计算统计
    const rec = await QuestionRecord.findByPk(recordId);
    const brandKeywordsArr = typeof rec?.brand_keywords === 'string'
      ? rec.brand_keywords.split(/[,，]/).map(s => s.trim()).filter(Boolean)
      : Array.isArray(rec?.brand_keywords) ? rec.brand_keywords : [];
    const keywordCounts = countKeywordOccurrences(originalText, brandKeywordsArr, true);

    // 更新问题记录状态与摘要
    await QuestionRecord.update(
      {
        status: 'completed',
        result_summary: { keyword_counts: keywordCounts }
      },
      { where: { id: recordId } }
    );

  } catch (error) {
    console.error(`处理AI查询失败 (recordId: ${recordId}):`, error);
    await QuestionRecord.update(
      {
        status: 'failed',
        error_message: error.message
      },
      { where: { id: recordId } }
    );
  }
}

// 获取检测任务状态
router.get('/status/:recordId', authRequired, async (req, res) => {
  try {
    const { recordId } = req.params;

    const record = await QuestionRecord.findOne({
      where: { id: recordId },
      include: [{
        model: ResultDetail,
        as: 'resultDetail'
      }]
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        message: '检测任务不存在'
      });
    }

    // 所有权验证：用户只能查看自己的记录，管理员可以查看所有
    if (req.user.role !== 'admin' && record.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: '无权访问该检测记录'
      });
    }

    res.json({
      success: true,
      data: {
        record_id: record.id,
        platform: record.platform,
        question: record.question,
        brand_keywords: record.brand_keywords,
        status: record.status,
        detection_time: record.detection_time,
        result_summary: record.result_summary,
        result_detail: record.resultDetail,
        error_message: record.error_message
      }
    });

  } catch (error) {
    console.error('获取任务状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取任务状态失败',
      error: error.message
    });
  }
});

// 获取所有用户的检测历史（管理员）
router.get('/history', adminRequired, async (req, res) => {
  try {
    const { page = 1, limit = 10, user_id, platform, status, q, brand } = req.query;
    const whereClause = {};
    if (user_id) whereClause.user_id = user_id;
    if (platform) whereClause.platform = platform;
    if (status) whereClause.status = status;
    if (brand && String(brand).trim() !== '') {
      whereClause.brand = { [Op.like]: `%${brand.trim()}%` };
    }
    if (q && String(q).trim() !== '') {
      whereClause.question = { [Op.like]: `%${q}%` };
    }
    const offset = (page - 1) * limit;
    const { count, rows } = await QuestionRecord.findAndCountAll({
      where: whereClause,
      include: [
        { model: ResultDetail, as: 'resultDetail', attributes: ['ai_response_original', 'parsing_status', 'parsing_error', 'created_at'] },
        { model: User, as: 'user', attributes: ['id', 'username', 'email'] }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    res.json({
      success: true,
      data: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil(count / limit),
        records: rows
      }
    });
  } catch (error) {
    console.error('获取管理员历史失败:', error);
    res.status(500).json({ success: false, message: '获取管理员历史失败', error: error.message });
  }
});

// 获取用户的检测历史
router.get('/history/:userId', authRequired, async (req, res) => {
  try {
    const { userId } = req.params;
    // 权限验证：管理员或本人可访问
    if (req.user.role !== 'admin' && req.user.id !== parseInt(userId)) {
      return res.status(403).json({ success: false, message: '无权访问' });
    }
    const { page = 1, limit = 10, platform, status, q, brand } = req.query;

    const whereClause = { user_id: userId };
    if (platform) whereClause.platform = platform;
    if (status) whereClause.status = status;
    if (brand && String(brand).trim() !== '') {
      whereClause.brand = { [Op.like]: `%${brand.trim()}%` };
    }
    if (q && String(q).trim() !== '') {
      whereClause.question = { [Op.like]: `%${q}%` };
    }

    const offset = (page - 1) * limit;

    const { count, rows } = await QuestionRecord.findAndCountAll({
      where: whereClause,
      include: [{
        model: ResultDetail,
        as: 'resultDetail',
        attributes: ['ai_response_original', 'parsing_status', 'parsing_error', 'created_at']
      }],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil(count / limit),
        records: rows
      }
    });

  } catch (error) {
    console.error('获取检测历史失败:', error);
    res.status(500).json({
      success: false,
      message: '获取检测历史失败',
      error: error.message
    });
  }
});



// 删除单条历史记录
router.delete('/record/:id', authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const rec = await QuestionRecord.findByPk(id);
    if (!rec) {
      return res.status(404).json({ success: false, message: '记录不存在' });
    }
    // 权限验证：管理员或记录所有者可删除
    if (req.user.role !== 'admin' && rec.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: '无权删除' });
    }
    await ResultDetail.destroy({ where: { question_record_id: id } });
    await QuestionRecord.destroy({ where: { id } });
    res.json({ success: true, message: '记录已删除' });
  } catch (error) {
    console.error('删除记录失败:', error);
    res.status(500).json({ success: false, message: '删除记录失败', error: error.message });
  }
});

// 批量删除历史记录（可按用户与过滤条件）
router.delete('/history/:userId', authRequired, async (req, res) => {
  try {
    const { userId } = req.params;
    // 权限验证：管理员或本人可删除
    if (req.user.role !== 'admin' && req.user.id !== parseInt(userId)) {
      return res.status(403).json({ success: false, message: '无权删除' });
    }
    const { platform, status, q, brand } = req.query;
    const whereClause = { user_id: userId };
    if (platform) whereClause.platform = platform;
    if (status) whereClause.status = status;
    if (brand && String(brand).trim() !== '') {
      whereClause.brand = { [Op.like]: `%${brand.trim()}%` };
    }
    if (q && String(q).trim() !== '') {
      whereClause.question = { [Op.like]: `%${q}%` };
    }
    // 找出匹配的记录ID
    const rows = await QuestionRecord.findAll({ where: whereClause, attributes: ['id'] });
    const ids = rows.map(r => r.id);
    if (ids.length === 0) {
      return res.json({ success: true, message: '无匹配记录', data: { deleted: 0 } });
    }
    await ResultDetail.destroy({ where: { question_record_id: { [Op.in]: ids } } });
    const del = await QuestionRecord.destroy({ where: { id: { [Op.in]: ids } } });
    res.json({ success: true, message: '批量删除完成', data: { deleted: del } });
  } catch (error) {
    console.error('批量删除失败:', error);
    res.status(500).json({ success: false, message: '批量删除失败', error: error.message });
  }
});

// 流式获取AI原文（SSE方式）
router.get('/stream', authRequired, async (req, res) => {
  try {
    const { platform = 'deepseek', question, brand } = req.query;
    const user_id = req.user.id; // 已通过 authRequired 验证
    let brandKeywordsStr = '';
    const qBrand = req.query.brand_keywords;
    const qHighlight = req.query.highlightKeywords || req.query.highlight_keywords;
    if (Array.isArray(qBrand)) {
      brandKeywordsStr = qBrand.map(s => String(s || '').trim()).filter(Boolean).join(',');
    } else if (typeof qBrand === 'string') {
      brandKeywordsStr = qBrand;
    } else if (Array.isArray(qHighlight)) {
      brandKeywordsStr = qHighlight.map(s => String(s || '').trim()).filter(Boolean).join(',');
    } else if (typeof qHighlight === 'string') {
      brandKeywordsStr = qHighlight;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    if (!question || (typeof question === 'string' && question.trim() === '')) {
      res.write(`data: ${JSON.stringify({ event: 'error', message: '问题不能为空' })}\n\n`);
      return res.end();
    }

    const cfg = AIPlatformService.platforms[platform];
    if (!cfg) {
      res.write(`data: ${JSON.stringify({ event: 'error', message: `不支持的AI平台: ${platform}` })}\n\n`);
      return res.end();
    }
    if (!cfg.apiKey) {
      res.write(`data: ${JSON.stringify({ event: 'error', message: `${cfg.name} API密钥未配置` })}\n\n`);
      return res.end();
    }

    // 流式场景下进行配额扣减（一次）并以 SSE 错误事件反馈不足
    const ok = await bulkConsumeQuota(req, res, 'detection', 1, { sse: true });
    if (!ok) return; // 已写入 SSE 错误并结束

    // 针对不同平台的流式策略：
    // - deepseek: 使用原生 SSE 流式接口
    // - doubao: 使用原生 SSE（Ark 支持 stream=true）
    // - 其他平台：使用非流式调用并模拟增量输出

    let fullText = '';

    if (platform === 'deepseek') {
      const requestData = {
        model: AIPlatformService.getModelName(platform),
        messages: [{ role: 'user', content: question }],
        temperature: 0.7,
        max_tokens: AIPlatformService.getMaxTokens(platform),
        stream: true
      };

      const streamReq = await axios.post(cfg.apiUrl, requestData, {
        headers: {
          ...cfg.headers,
          Accept: 'text/event-stream'
        },
        responseType: 'stream',
        timeout: 120000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        proxy: false,
        httpsAgent: new https.Agent({ keepAlive: true })
      });

      streamReq.data.on('data', (chunk) => {
        const str = chunk.toString('utf8');
        const lines = str.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.replace(/^data:\s*/, '');
          if (payload === '[DONE]') {
            res.write(`data: ${JSON.stringify({ event: 'done' })}\n\n`);
            continue;
          }
          try {
            const json = JSON.parse(payload);
            const delta = json?.choices?.[0]?.delta?.content || json?.choices?.[0]?.message?.content || '';
            if (delta) {
              fullText += delta;
              res.write(`data: ${JSON.stringify({ event: 'delta', content: delta })}\n\n`);
            }
          } catch (e) {
            // 若为纯文本或不可解析，则直接作为增量输出
            fullText += payload;
            res.write(`data: ${JSON.stringify({ event: 'delta', content: payload })}\n\n`);
          }
        }
      });

      streamReq.data.on('end', async () => {
        try {
          // 持久化记录
          const record = await QuestionRecord.create({
            user_id: user_id,
            platform,
            question,
            brand: brand ? String(brand).trim() : null,
            brand_keywords: brandKeywordsStr || ''
          });
          await ResultDetail.create({
            question_record_id: record.id,
            ai_response_original: fullText,
            parsing_status: 'completed'
          });
          const keywordsArr = typeof brandKeywordsStr === 'string'
            ? brandKeywordsStr.split(/[,，]/).map(s => s.trim()).filter(Boolean)
            : [];
          const keywordCounts = countKeywordOccurrences(fullText, keywordsArr, true);
          await QuestionRecord.update(
            { status: 'completed', result_summary: { keyword_counts: keywordCounts } },
            { where: { id: record.id } }
          );
        } catch (err) {
          console.error('保存流式结果失败:', err.message);
        }
        res.write(`data: ${JSON.stringify({ event: 'done' })}\n\n`);
        res.end();
      });

      streamReq.data.on('error', (err) => {
        res.write(`data: ${JSON.stringify({ event: 'error', message: err.message })}\n\n`);
        res.end();
      });

    } else if (platform === 'doubao') {
      // Ark Doubao 原生 SSE
      const requestData = {
        model: AIPlatformService.getModelName(platform),
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: question }
        ],
        temperature: 0.7,
        stream: true,
        max_tokens: 1024
      };

      // 可选代理支持
      const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.PROXY_URL;
      let agent = new https.Agent({ keepAlive: true });
      if (proxyUrl && HttpsProxyAgent) {
        try { agent = new HttpsProxyAgent(proxyUrl); } catch (e) { console.warn('代理初始化失败:', e.message); }
      } else if (proxyUrl && !HttpsProxyAgent) {
        console.warn('未安装 https-proxy-agent，忽略代理设置');
      }

      try {
        const streamReq = await axios.post(cfg.apiUrl, requestData, {
          headers: { ...cfg.headers, Accept: 'text/event-stream' },
          responseType: 'stream',
          timeout: 120000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          proxy: false,
          httpsAgent: agent
        });

        streamReq.data.on('data', (chunk) => {
          const str = chunk.toString('utf8');
          const lines = str.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.replace(/^data:\s*/, '');
            if (payload === '[DONE]') {
              res.write(`data: ${JSON.stringify({ event: 'done' })}\n\n`);
              continue;
            }
            try {
              const json = JSON.parse(payload);
              const delta = json?.choices?.[0]?.delta?.content || json?.choices?.[0]?.message?.content || '';
              if (delta) {
                fullText += delta;
                res.write(`data: ${JSON.stringify({ event: 'delta', content: delta })}\n\n`);
              }
            } catch (e) {
              fullText += payload;
              res.write(`data: ${JSON.stringify({ event: 'delta', content: payload })}\n\n`);
            }
          }
        });

        streamReq.data.on('end', async () => {
          try {
            const record = await QuestionRecord.create({
              user_id: user_id,
              platform,
              question,
              brand: brand ? String(brand).trim() : null,
              brand_keywords: brandKeywordsStr || ''
            });
            await ResultDetail.create({
              question_record_id: record.id,
              ai_response_original: fullText,
              parsing_status: 'completed'
            });
            const keywordsArr = typeof brandKeywordsStr === 'string'
              ? brandKeywordsStr.split(/[,，]/).map(s => s.trim()).filter(Boolean)
              : [];
            const keywordCounts = countKeywordOccurrences(fullText, keywordsArr, true);
            await QuestionRecord.update(
              { status: 'completed', result_summary: { keyword_counts: keywordCounts } },
              { where: { id: record.id } }
            );
          } catch (err) {
            console.error('保存豆包流式结果失败:', err.message);
          }
          res.write(`data: ${JSON.stringify({ event: 'done' })}\n\n`);
          res.end();
        });

        streamReq.data.on('error', (err) => {
          res.write(`data: ${JSON.stringify({ event: 'error', message: err.message })}\n\n`);
          res.end();
        });
      } catch (err) {
        res.write(`data: ${JSON.stringify({ event: 'error', message: err.message })}\n\n`);
        res.end();
      }
    } else {
      // 非原生流式平台：一次性获取结果并模拟增量输出
      try {
        const result = await AIPlatformService.queryPlatform(platform, question);
        if (!result.success) {
          res.write(`data: ${JSON.stringify({ event: 'error', message: result.error })}\n\n`);
          return res.end();
        }
        fullText = ResultParserService.extractResponseText(result.data);
        // 模拟增量：优先按句子切分，若不足则按定长切片
        const toChunks = (text) => {
          const normalized = String(text || '').replace(/\r\n/g, '\n');
          // 先按段落拆分，再细分为句子（中文标点与英文标点）
          let parts = normalized.split(/\n\n+/).flatMap(p => p.split(/(?<=[。！？!?])/));
          parts = parts.map(s => s.trim()).filter(Boolean);
          // 若切分过少，退化为定长切片，提升流式可感知性
          if (parts.length < 6) {
            const chunks = [];
            const size = 60; // 约 60 字一片
            for (let i = 0; i < normalized.length; i += size) {
              const slice = normalized.slice(i, i + size).trim();
              if (slice) chunks.push(slice);
            }
            return chunks;
          }
          return parts;
        };
        const chunks = toChunks(fullText);
        for (const piece of chunks) {
          res.write(`data: ${JSON.stringify({ event: 'delta', content: piece })}\n\n`);
          // 尽量刷新，让浏览器及时显示
          if (typeof res.flush === 'function') { try { res.flush(); } catch (_) { } }
          await new Promise(r => setTimeout(r, 45));
        }
        // 持久化记录
        const record = await QuestionRecord.create({
          user_id: user_id,
          platform,
          question,
          brand: brand ? String(brand).trim() : null,
          brand_keywords: brandKeywordsStr || ''
        });
        await ResultDetail.create({
          question_record_id: record.id,
          ai_response_original: fullText,
          parsing_status: 'completed'
        });
        const keywordsArr = typeof brandKeywordsStr === 'string'
          ? brandKeywordsStr.split(/[,，]/).map(s => s.trim()).filter(Boolean)
          : [];
        const keywordCounts = countKeywordOccurrences(fullText, keywordsArr, true);
        await QuestionRecord.update(
          { status: 'completed', result_summary: { keyword_counts: keywordCounts } },
          { where: { id: record.id } }
        );
        res.write(`data: ${JSON.stringify({ event: 'done' })}\n\n`);
        res.end();
      } catch (err) {
        res.write(`data: ${JSON.stringify({ event: 'error', message: err.message })}\n\n`);
        res.end();
      }
    }

  } catch (error) {
    console.error('SSE流式接口异常:', error);
    try {
      res.write(`data: ${JSON.stringify({ event: 'error', message: error.message })}\n\n`);
    } catch (_) { }
    res.end();
  }
});

module.exports = router;
