const challenges = new Map();
const crypto = require('crypto');
let svgCaptcha;
try {
  svgCaptcha = require('svg-captcha');
} catch (_) {
  // 依赖未安装时，后续会使用文本题目作为兜底
}

function genId() {
  // 使用加密安全的随机数生成器
  return crypto.randomBytes(16).toString('hex');
}

function createChallenge() {
  // 简单算术验证码：确保非负结果
  const a = Math.floor(Math.random() * 10) + 1; // 1-10
  const b = Math.floor(Math.random() * 10) + 1; // 1-10
  const ops = ['+', '-'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let question;
  let answer;
  if (op === '+') {
    question = `${a} + ${b} = ?`;
    answer = String(a + b);
  } else {
    const aa = Math.max(a, b);
    const bb = Math.min(a, b);
    question = `${aa} - ${bb} = ?`;
    answer = String(aa - bb);
  }
  const id = genId();
  const ttlMs = 5 * 60 * 1000; // 5分钟有效
  const expiresAt = Date.now() + ttlMs;
  challenges.set(id, { answer, expiresAt });
  return { id, question, ttlMs };
}

function createSvgChallenge() {
  // 优先使用 svg-captcha 生成图形验证码
  if (svgCaptcha && typeof svgCaptcha.create === 'function') {
    const captcha = svgCaptcha.create({
      size: 4,
      noise: 3,
      color: true,
      background: '#ffffff',
      width: 120,
      height: 40,
      // 统一使用小写字母与数字，且禁用易混淆字符
      // 移除: i, l, o, 0, 1, 以及 O/I/L（尽管已限定小写，仍用 ignoreChars 双重保险）
      charPreset: 'abcdefghjkmnpqrstuvwxy23456789',
      ignoreChars: 'ilo01OIL'
    });
    const id = genId();
    const ttlMs = 5 * 60 * 1000;
    const expiresAt = Date.now() + ttlMs;
    challenges.set(id, { answer: String(captcha.text).toLowerCase(), expiresAt });
    return { id, svg: captcha.data, ttlMs };
  }
  // 兜底：没有依赖时生成简单文本题目的 SVG
  const basic = createChallenge();
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="240" height="60">
    <rect width="100%" height="100%" fill="#ffffff" />
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="24" fill="#333">${basic.question}</text>
  </svg>`;
  return { id: basic.id, svg, ttlMs: basic.ttlMs };
}

function verify(id, answer) {
  const rec = challenges.get(id);
  if (!rec) return { ok: false, reason: 'not_found' };
  if (Date.now() > rec.expiresAt) {
    challenges.delete(id);
    return { ok: false, reason: 'expired' };
  }
  const expect = String(rec.answer).trim();
  const got = String(answer == null ? '' : answer).trim().toLowerCase();
  const ok = expect === got;
  // 验证后无论成功与否都删除，避免重复使用
  challenges.delete(id);
  return { ok, reason: ok ? undefined : 'mismatch' };
}

function cleanupExpired() {
  const now = Date.now();
  for (const [id, rec] of challenges.entries()) {
    if (now > rec.expiresAt) challenges.delete(id);
  }
}

setInterval(() => {
  try { cleanupExpired(); } catch (_) {}
}, 60 * 1000);

module.exports = { createChallenge, verify };
module.exports.createSvgChallenge = createSvgChallenge;