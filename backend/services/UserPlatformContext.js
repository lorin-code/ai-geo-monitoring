const { AsyncLocalStorage } = require('node:async_hooks');
const storage = new AsyncLocalStorage();

module.exports = {
  get: () => storage.getStore(),
  async run(userId, action) {
    const configs = await require('./UserPlatformCredentialService').loadConfigs(userId);
    return storage.run({ userId: Number(userId), configs }, action);
  },
  middleware: async (req, res, next) => {
    try {
      await module.exports.run(req.user.id, () => next());
    } catch {
      res.status(500).json({ success: false, message: '读取模型配置失败，请稍后重试' });
    }
  }
};
