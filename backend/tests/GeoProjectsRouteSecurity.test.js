const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('prompt generation errors do not expose raw AI responses to clients', () => {
  const routePath = path.resolve(__dirname, '../routes/geoProjects.js');
  const source = fs.readFileSync(routePath, 'utf8');

  assert.doesNotMatch(source, /data:\s*\{\s*raw\b/);
  assert.doesNotMatch(source, /raw_responses\.join\(/);
});

test('geo project 500 responses do not expose internal error messages', () => {
  const routePath = path.resolve(__dirname, '../routes/geoProjects.js');
  const source = fs.readFileSync(routePath, 'utf8');

  assert.doesNotMatch(source, /status\(\s*500\s*\)\.json\(\{[\s\S]*?error:\s*error\.message/);
});

test('prompt generation platform failures do not expose internal generation errors', () => {
  const routePath = path.resolve(__dirname, '../routes/geoProjects.js');
  const source = fs.readFileSync(routePath, 'utf8');

  assert.doesNotMatch(source, /error:\s*generation\.error/);
});
