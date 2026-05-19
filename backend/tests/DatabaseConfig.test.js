const test = require('node:test');
const assert = require('node:assert/strict');

const databaseConfigPath = require.resolve('../config/database');

function loadDatabaseWithEnv(env) {
  const originalEnv = { ...process.env };
  Object.assign(process.env, env);
  for (const key of ['DATABASE_URL', 'DB_STORAGE', 'NODE_ENV']) {
    if (!(key in env)) {
      delete process.env[key];
    }
  }
  delete require.cache[databaseConfigPath];

  try {
    return require('../config/database');
  } finally {
    delete require.cache[databaseConfigPath];
    process.env = originalEnv;
  }
}

test('uses Supabase Postgres when DATABASE_URL is configured', async () => {
  const sequelize = loadDatabaseWithEnv({
    DATABASE_URL: 'postgresql://postgres:secret@db.example.supabase.co:5432/postgres',
    NODE_ENV: 'production'
  });

  try {
    assert.equal(sequelize.getDialect(), 'postgres');
    assert.equal(sequelize.options.dialectOptions.ssl.require, true);
    assert.equal(sequelize.options.dialectOptions.ssl.rejectUnauthorized, false);
    assert.equal(sequelize.options.logging, false);
  } finally {
    await sequelize.close();
  }
});

test('keeps SQLite for local development when DATABASE_URL is not configured', async () => {
  const sequelize = loadDatabaseWithEnv({
    DB_STORAGE: 'local-test.sqlite',
    NODE_ENV: 'development'
  });

  try {
    assert.equal(sequelize.getDialect(), 'sqlite');
    assert.equal(sequelize.options.storage, 'local-test.sqlite');
    assert.equal(typeof sequelize.options.logging, 'function');
  } finally {
    await sequelize.close();
  }
});
