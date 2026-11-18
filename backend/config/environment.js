const dotenv = require('dotenv');
const path = require('node:path');

function loadEnvironment({ path: envPath = path.resolve(__dirname, '../.env'), processEnv = process.env } = {}) {
  const result = dotenv.config({ path: envPath, processEnv, quiet: true });

  // Local development uses this project's configuration.
  // Production retains dotenv's normal deployment-environment precedence.
  if (processEnv.NODE_ENV === 'development' && result.parsed) {
    dotenv.populate(processEnv, result.parsed, { override: true });
  }

  return result;
}

module.exports = loadEnvironment;
module.exports.getServerConfig = (env = process.env) => {
  const port = Number(env.PORT);
  if (!/^\d+$/.test(String(env.PORT || '')) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be set to a valid port in backend/.env (copy backend/.env.example first)');
  }
  return { port, allowedOrigins: String(env.ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean) };
};
