const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/auth');
const CredentialService = require('../services/UserPlatformCredentialService');
const rateLimit = require('express-rate-limit');
const validateLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 10,
  keyGenerator: (req) => String(req.user.id),
  message: { success: false, message: '校验次数过多，请 10 分钟后再试' } });

// Only the current user's masked, previously validated credential status is returned.
router.get('/ping', authRequired, async (req, res) => {
  try {
    const result = await CredentialService.list(req.user.id);

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('平台自检失败:', error);
    res.status(500).json({ success: false, message: '平台自检失败' });
  }
});

router.post('/:platform/credential', authRequired, validateLimiter, async (req, res) => {
  try {
    const data = await CredentialService.verifyAndSave({ userId: req.user.id, platform: req.params.platform, input: req.body });
    res.json({ success: true, message: '校验通过，密钥已保存', data });
  } catch (error) {
    const status = [400, 422].includes(error.status) ? error.status : 500;
    res.status(status).json({ success: false, message: status === 500 ? '保存模型配置失败，请稍后重试' : error.message });
  }
});

router.delete('/:platform/credential', authRequired, async (req, res) => {
  try {
    await CredentialService.remove(req.user.id, req.params.platform);
    res.json({ success: true, message: '密钥已删除，该平台已禁用' });
  } catch {
    res.status(500).json({ success: false, message: '删除模型配置失败' });
  }
});

module.exports = router;
