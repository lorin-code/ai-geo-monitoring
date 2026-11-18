const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadEnvironment = require('../config/environment');

function createEnvFile(t, contents) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'geo-environment-'));
  const envPath = path.join(directory, '.env');
  fs.writeFileSync(envPath, contents);
  t.after(() => {
    fs.unlinkSync(envPath);
    fs.rmdirSync(directory);
  });
  return envPath;
}

test('local development uses project server settings over inherited settings', (t) => {
  const envPath = createEnvFile(t, [
    'NODE_ENV=development',
    'PORT=3002',
    'ALLOWED_ORIGINS=https://project.example'
  ].join('\n'));
  const processEnv = {
    PORT: '4000',
    ALLOWED_ORIGINS: 'https://inherited.example'
  };

  loadEnvironment({ path: envPath, processEnv });

  assert.equal(processEnv.NODE_ENV, 'development');
  assert.equal(processEnv.PORT, '3002');
  assert.equal(processEnv.ALLOWED_ORIGINS, 'https://project.example');
});

test('production keeps deployment settings even when a development env file exists', (t) => {
  const envPath = createEnvFile(t, [
    'NODE_ENV=development',
    'ALLOWED_ORIGINS=https://local.example',
    'PORT=3002'
  ].join('\n'));
  const processEnv = {
    NODE_ENV: 'production',
    ALLOWED_ORIGINS: 'https://deployment.example'
  };

  loadEnvironment({ path: envPath, processEnv });

  assert.equal(processEnv.NODE_ENV, 'production');
  assert.equal(processEnv.ALLOWED_ORIGINS, 'https://deployment.example');
  assert.equal(processEnv.PORT, '3002');
});

test('server uses only the configured port and trimmed origin allowlist, with no localhost fallback', () => {
  assert.deepEqual(loadEnvironment.getServerConfig({ PORT: '4567', ALLOWED_ORIGINS: ' https://site.example, ,https://admin.example ' }), {
    port: 4567, allowedOrigins: ['https://site.example', 'https://admin.example']
  });
  assert.deepEqual(loadEnvironment.getServerConfig({ PORT: '4567' }).allowedOrigins, []);
  for (const PORT of [undefined, '', '0', '65536', '3002abc', '1.5']) {
    assert.throws(() => loadEnvironment.getServerConfig({ PORT }), /PORT must be set/);
  }
});
