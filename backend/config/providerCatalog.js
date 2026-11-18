// User credentials are sent only to these official endpoints; clients cannot override URLs.
module.exports = {
  deepseek: {
    name: 'DeepSeek', apiUrl: 'https://api.deepseek.com/v1/chat/completions',
    searchUrl: 'https://api.deepseek.com/v1/tools/search', model: 'deepseek-flash',
    consoleUrl: 'https://platform.deepseek.com/api_keys'
  },
  doubao: {
    name: '豆包', apiUrl: 'https://ark.cn-beijing.volces.com/api/v3/responses',
    model: 'doubao-seed-2-1-lite-260915', consoleUrl: 'https://console.volcengine.com/ark/'
  },
  qianwen: {
    name: '千问', apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: 'qwen-plus', consoleUrl: 'https://bailian.console.aliyun.com/'
  },
  kimi: {
    name: 'Kimi', apiUrl: 'https://api.moonshot.cn/v1/chat/completions',
    searchUrl: 'https://api.moonshot.cn/v1/tools/search', model: 'kimi-k3.1-pro',
    consoleUrl: 'https://platform.kimi.com/console/api-keys'
  }
};
