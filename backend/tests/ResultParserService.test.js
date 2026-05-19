const test = require('node:test');
const assert = require('node:assert/strict');

const ResultParserService = require('../services/ResultParserService');

test('extracts text from chat message content arrays', () => {
  const text = ResultParserService.extractResponseText({
    choices: [
      {
        message: {
          content: [
            { type: 'text', text: '米其林适合重视静音的用户。' },
            { type: 'text', text: '马牌更偏运动操控。' }
          ]
        }
      }
    ]
  });

  assert.equal(text, '米其林适合重视静音的用户。\n马牌更偏运动操控。');
});

test('extracts text from common flat AI response fields before stringifying JSON', () => {
  assert.equal(
    ResultParserService.extractResponseText({ output_text: '豆包适合中文内容生产。' }),
    '豆包适合中文内容生产。'
  );
  assert.equal(
    ResultParserService.extractResponseText({ text: 'DeepSeek 适合代码场景。' }),
    'DeepSeek 适合代码场景。'
  );
});

test('extracts text from completion-style choices', () => {
  assert.equal(
    ResultParserService.extractResponseText({
      choices: [{ text: '米其林适合重视静音的用户。' }]
    }),
    '米其林适合重视静音的用户。'
  );
  assert.equal(
    ResultParserService.extractResponseText({
      data: { choices: [{ text: '马牌更偏运动操控。' }] }
    }),
    '马牌更偏运动操控。'
  );
});

test('extracts text from response output content arrays', () => {
  assert.equal(
    ResultParserService.extractResponseText({
      output: [
        {
          type: 'message',
          content: [
            { type: 'output_text', text: 'Goodie AI 适合做 GEO 品牌监测。' },
            { type: 'output_text', text: 'DeepSeek 和豆包都可以作为监测平台。' }
          ]
        }
      ]
    }),
    'Goodie AI 适合做 GEO 品牌监测。\nDeepSeek 和豆包都可以作为监测平台。'
  );
});

test('extracts text from answer and result fields before stringifying JSON', () => {
  assert.equal(
    ResultParserService.extractResponseText({ answer: '品牌被提及一次。' }),
    '品牌被提及一次。'
  );
  assert.equal(
    ResultParserService.extractResponseText({ data: { result: '竞品也被提及。' } }),
    '竞品也被提及。'
  );
});

test('keeps structured empty AI response text empty instead of stringifying JSON', () => {
  assert.equal(
    ResultParserService.extractResponseText({ choices: [{ message: { content: '' } }] }),
    ''
  );
});

test('does not stringify unknown structured AI responses as answer text', () => {
  assert.equal(
    ResultParserService.extractResponseText({
      request: { question: '米其林轮胎值得买吗' },
      usage: { total_tokens: 20 }
    }),
    ''
  );
});
