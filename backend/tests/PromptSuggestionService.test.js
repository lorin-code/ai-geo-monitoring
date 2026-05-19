const test = require('node:test');
const assert = require('node:assert/strict');

const PromptSuggestionService = require('../services/PromptSuggestionService');

test('parses JSON prompt suggestions from fenced AI output', () => {
  const suggestions = PromptSuggestionService.parseSuggestions('```json\n[{"question":"豆包适合哪些企业使用？","tags":["产品适配"]}]\n```');

  assert.deepEqual(suggestions, [
    { question: '豆包适合哪些企业使用', tags: ['产品适配'] }
  ]);
});

test('parses JSON prompt suggestions from common object wrappers', () => {
  const suggestions = PromptSuggestionService.parseSuggestions(JSON.stringify({
    prompts: [
      { question: '静音轮胎怎么选', tags: ['购买决策'] },
      { question: '新能源车轮胎推荐', tags: ['购买决策'] }
    ]
  }), {
    requestedCount: 2
  });

  assert.deepEqual(suggestions.map((item) => item.question), [
    '静音轮胎怎么选',
    '新能源车轮胎推荐'
  ]);
});

test('parses JSON prompt suggestions when AI adds a short preamble before the array', () => {
  const suggestions = PromptSuggestionService.parseSuggestions('以下是生成的问题：\n[{"question":"静音轮胎怎么选","tags":["购买决策"]},{"question":"新能源车轮胎推荐","tags":["购买决策"]}]', {
    requestedCount: 2
  });

  assert.deepEqual(suggestions.map((item) => item.question), [
    '静音轮胎怎么选',
    '新能源车轮胎推荐'
  ]);
});

test('parses object wrapped prompt suggestions when metadata arrays appear before prompts', () => {
  const suggestions = PromptSuggestionService.parseSuggestions(JSON.stringify({
    notes: [],
    prompts: [
      { question: 'AI品牌监测怎么做', tags: ['购买决策'] },
      { question: 'GEO工具怎么选', tags: ['产品适配'] }
    ]
  }), {
    requestedCount: 2
  });

  assert.deepEqual(suggestions.map((item) => item.question), [
    'AI品牌监测怎么做',
    'GEO工具怎么选'
  ]);
});

test('parses nested result wrapped prompt suggestions from proxy responses', () => {
  const suggestions = PromptSuggestionService.parseSuggestions(JSON.stringify({
    result: {
      prompts: [
        { question: 'AI品牌监测怎么做', tags: ['购买决策'] },
        { question: 'GEO工具怎么选', tags: ['产品适配'] }
      ]
    }
  }), {
    requestedCount: 2
  });

  assert.deepEqual(suggestions.map((item) => item.question), [
    'AI品牌监测怎么做',
    'GEO工具怎么选'
  ]);
});

test('parses stringified data wrapped prompt suggestions from proxy responses', () => {
  const suggestions = PromptSuggestionService.parseSuggestions(JSON.stringify({
    data: JSON.stringify([
      { question: 'AI品牌监测怎么做', tags: ['购买决策'] },
      { question: 'GEO工具怎么选', tags: ['产品适配'] }
    ])
  }), {
    requestedCount: 2
  });

  assert.deepEqual(suggestions.map((item) => item.question), [
    'AI品牌监测怎么做',
    'GEO工具怎么选'
  ]);
});

test('ignores non-json wrapper strings before nested prompt suggestions', () => {
  const suggestions = PromptSuggestionService.parseSuggestions(JSON.stringify({
    data: '生成完成',
    result: {
      prompts: [
        { question: 'AI品牌监测怎么做', tags: ['购买决策'] },
        { question: 'GEO工具怎么选', tags: ['产品适配'] }
      ]
    }
  }), {
    requestedCount: 2
  });

  assert.deepEqual(suggestions.map((item) => item.question), [
    'AI品牌监测怎么做',
    'GEO工具怎么选'
  ]);
});

test('parses preambled object wrapped prompt suggestions when metadata arrays appear first', () => {
  const suggestions = PromptSuggestionService.parseSuggestions(`以下是生成的问题：
${JSON.stringify({
    notes: [],
    prompts: [
      { question: 'AI品牌监测怎么做', tags: ['购买决策'] },
      { question: 'GEO工具怎么选', tags: ['产品适配'] }
    ]
  })}`, {
    requestedCount: 2
  });

  assert.deepEqual(suggestions.map((item) => item.question), [
    'AI品牌监测怎么做',
    'GEO工具怎么选'
  ]);
});

test('parses later prompt array when AI emits a leading metadata object', () => {
  const suggestions = PromptSuggestionService.parseSuggestions('{"note":"生成完成"}\n[{"question":"静音轮胎怎么选","tags":["购买决策"]},{"question":"新能源车轮胎推荐","tags":["购买决策"]}]', {
    requestedCount: 2
  });

  assert.deepEqual(suggestions.map((item) => item.question), [
    '静音轮胎怎么选',
    '新能源车轮胎推荐'
  ]);
});

test('skips leading empty JSON arrays before real prompt suggestions', () => {
  const suggestions = PromptSuggestionService.parseSuggestions('[]\n[{"question":"静音轮胎怎么选","tags":["购买决策"]},{"question":"新能源车轮胎推荐","tags":["购买决策"]}]', {
    requestedCount: 2
  });

  assert.deepEqual(suggestions.map((item) => item.question), [
    '静音轮胎怎么选',
    '新能源车轮胎推荐'
  ]);
});

test('falls back to numbered lines when AI does not return JSON', () => {
  const suggestions = PromptSuggestionService.parseSuggestions('1. DeepSeek 和豆包哪个更适合内容团队？\n2. 豆包的替代方案有哪些？');

  assert.deepEqual(suggestions, [
    { question: 'DeepSeek 和豆包哪个更适合内容团队', tags: ['竞品对比'] },
    { question: '豆包的替代方案有哪些', tags: ['替代方案'] }
  ]);
});

test('does not keep malformed JSON fragments as prompt suggestions', () => {
  const suggestions = PromptSuggestionService.parseSuggestions('以下是生成的问题：\n[{"question":"静音轮胎怎么选","tags":["购买决策"]');

  assert.deepEqual(suggestions, []);
});

test('preserves numeric industry terms in fallback prompt parsing', () => {
  const suggestions = PromptSuggestionService.parseSuggestions('3C数码品牌怎么选\nB2B营销工具推荐', {
    requestedCount: 2
  });

  assert.deepEqual(suggestions.map((item) => item.question), [
    '3C数码品牌怎么选',
    'B2B营销工具推荐'
  ]);
});

test('ignores fallback parser preamble lines from AI output', () => {
  const suggestions = PromptSuggestionService.parseSuggestions('以下是生成的问题：\n1. 静音轮胎怎么选\n2. 新能源车轮胎推荐', {
    requestedCount: 2
  });

  assert.deepEqual(suggestions.map((item) => item.question), [
    '静音轮胎怎么选',
    '新能源车轮胎推荐'
  ]);
});

test('derives prompt suggestion tags when AI omits tags', () => {
  const suggestions = PromptSuggestionService.parseSuggestions(JSON.stringify([
    { question: '静音轮胎怎么选' },
    { question: '新能源车轮胎价格' },
    { question: '轮胎售后风险有哪些' }
  ]));

  assert.deepEqual(suggestions, [
    { question: '静音轮胎怎么选', tags: ['购买决策'] },
    { question: '新能源车轮胎价格', tags: ['价格成本'] },
    { question: '轮胎售后风险有哪些', tags: ['风险顾虑'] }
  ]);
});

test('normalizes string prompt suggestion tags from AI output', () => {
  const suggestions = PromptSuggestionService.parseSuggestions(JSON.stringify([
    { question: 'SUV轮胎怎么选', tags: '产品适配' }
  ]));

  assert.deepEqual(suggestions, [
    { question: 'SUV轮胎怎么选', tags: ['产品适配'] }
  ]);
});

test('normalizes prompt suggestions to short user-style prompts without forcing punctuation', () => {
  const suggestions = PromptSuggestionService.parseSuggestions(JSON.stringify([
    {
      question: '我是一家大型企业的市场负责人，预算有限，希望了解豆包在内容团队日常提效、竞品对比和长期投入产出方面是否值得使用',
      tags: ['购买决策']
    }
  ]));

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].question.length <= 28, true);
  assert.equal(suggestions[0].question.includes('？'), false);
});

test('deduplicates generated suggestions that only differ by whitespace or trailing punctuation', () => {
  const suggestions = PromptSuggestionService.parseSuggestions(JSON.stringify([
    { question: '静音 轮胎怎么选？', tags: ['购买决策'] },
    { question: '静音轮胎怎么选', tags: ['购买决策'] },
    { question: '新能源车轮胎推荐', tags: ['购买决策'] }
  ]), {
    requestedCount: 3
  });

  assert.deepEqual(suggestions.map((item) => item.question), [
    '静音轮胎怎么选',
    '新能源车轮胎推荐'
  ]);
});

test('removes unnatural spaces inside Chinese generated questions', () => {
  const suggestions = PromptSuggestionService.parseSuggestions(JSON.stringify([
    { question: 'AI 搜索 优化 怎么做', tags: ['购买决策'] },
    { question: '新能源 车 轮胎 推荐', tags: ['购买决策'] }
  ]), {
    requestedCount: 2
  });

  assert.deepEqual(suggestions.map((item) => item.question), [
    'AI搜索优化怎么做',
    '新能源车轮胎推荐'
  ]);
});

test('removes numbering prefixes inside JSON prompt question fields', () => {
  const suggestions = PromptSuggestionService.parseSuggestions(JSON.stringify([
    { question: '1. 静音轮胎怎么选？', tags: ['购买决策'] },
    { question: '（2）新能源车轮胎推荐', tags: ['购买决策'] },
    { question: '3、马牌和日系轮胎哪个好', tags: ['竞品对比'] }
  ]), {
    requestedCount: 3
  });

  assert.deepEqual(suggestions.map((item) => item.question), [
    '静音轮胎怎么选',
    '新能源车轮胎推荐',
    '马牌和日系轮胎哪个好'
  ]);
});

test('removes Chinese numbering prefixes inside generated prompt question fields', () => {
  const suggestions = PromptSuggestionService.parseSuggestions(JSON.stringify([
    { question: '一、静音轮胎怎么选', tags: ['购买决策'] },
    { question: '第2题：新能源车轮胎推荐', tags: ['购买决策'] },
    { question: '问题3：马牌和日系轮胎哪个好', tags: ['竞品对比'] }
  ]), {
    requestedCount: 3
  });

  assert.deepEqual(suggestions.map((item) => item.question), [
    '静音轮胎怎么选',
    '新能源车轮胎推荐',
    '马牌和日系轮胎哪个好'
  ]);
});

test('removes common label prefixes inside JSON prompt question fields', () => {
  const suggestions = PromptSuggestionService.parseSuggestions(JSON.stringify([
    { question: '问题：静音轮胎怎么选', tags: ['购买决策'] },
    { question: 'Q: 新能源车轮胎推荐', tags: ['购买决策'] },
    { question: 'Question：马牌和米其林哪个好', tags: ['竞品对比'] }
  ]), {
    requestedCount: 3
  });

  assert.deepEqual(suggestions.map((item) => item.question), [
    '静音轮胎怎么选',
    '新能源车轮胎推荐',
    '马牌和米其林哪个好'
  ]);
});

test('keeps comma separated comparison prompts as usable user questions', () => {
  const suggestions = PromptSuggestionService.parseSuggestions(JSON.stringify([
    { question: 'DeepSeek，豆包哪个更适合内容团队？', tags: ['竞品对比'] },
    { question: '马牌, 米其林哪个更推荐', tags: ['竞品对比'] }
  ]), {
    requestedCount: 2
  });

  assert.deepEqual(suggestions.map((item) => item.question), [
    'DeepSeek和豆包哪个更适合内容团队',
    '马牌和米其林哪个更推荐'
  ]);
});

test('keeps comma separated short intent prompts as usable user questions', () => {
  const suggestions = PromptSuggestionService.parseSuggestions(JSON.stringify([
    { question: '静音轮胎，怎么选？', tags: ['购买决策'] },
    { question: 'AI品牌监测, 如何做', tags: ['产品适配'] }
  ]), {
    requestedCount: 2
  });

  assert.deepEqual(suggestions.map((item) => item.question), [
    '静音轮胎怎么选',
    'AI品牌监测如何做'
  ]);
});

test('builds generation prompt around industry and project keywords', () => {
  const question = PromptSuggestionService.buildGenerationQuestion(
    {
      name: 'Goodie AI',
      industry: 'AI 营销',
      primary_keywords: ['AI 搜索优化', '品牌可见度监测'],
      platforms: ['deepseek']
    },
    [{ name: '竞品 A' }],
    { count: 8, focus: '购买决策' }
  );

  assert.match(question, /行业：AI 营销/);
  assert.match(question, /行业\/场景核心关键词：AI 搜索优化、品牌可见度监测/);
  assert.match(question, /至少一半问题必须围绕行业场景或核心关键词/);
  assert.match(question, /品牌直问问题最多占 15%/);
});

test('frames prompt generation as visibility tracking without nudging every question toward the brand', () => {
  const question = PromptSuggestionService.buildGenerationQuestion(
    {
      name: '米其林',
      industry: '轮胎',
      primary_keywords: ['静音轮胎'],
      platforms: ['deepseek']
    },
    [{ name: '马牌' }],
    { count: 10 }
  );

  assert.match(question, /目标品牌：米其林/);
  assert.match(question, /行业、品类和竞品场景下的 AI 品牌可见度/);
  assert.doesNotMatch(question, /自然提及品牌/);
});

test('builds generation prompt with industry-first ratio and brand limit', () => {
  const question = PromptSuggestionService.buildGenerationQuestion(
    {
      name: '米其林',
      aliases: ['Michelin'],
      industry: '轮胎',
      primary_keywords: ['静音轮胎', '新能源车轮胎'],
      platforms: ['deepseek']
    },
    [{ name: '马牌' }],
    { count: 10 }
  );

  assert.match(question, /60% 行业、场景、品类或非品牌专属核心关键词问题/);
  assert.match(question, /15% 品牌直问问题/);
  assert.match(question, /非“品牌直问”问题的 question 禁止出现品牌名、品牌别名、品牌专属产品词或型号/);
});

test('builds generation prompt that treats brand-owned product terms as brand-direct', () => {
  const question = PromptSuggestionService.buildGenerationQuestion(
    {
      name: '米其林',
      aliases: ['Michelin'],
      industry: '轮胎',
      primary_keywords: ['Pilot Sport 5', '静音轮胎'],
      platforms: ['deepseek']
    },
    [{ name: '马牌' }],
    { count: 10 }
  );

  assert.match(question, /品牌专属产品词或型号/);
  assert.match(question, /通用行业词、品类词或非品牌专属核心关键词/);
});

test('separates generic core keywords from brand-owned product terms in generation prompt', () => {
  const question = PromptSuggestionService.buildGenerationQuestion(
    {
      name: '米其林',
      aliases: ['Michelin'],
      industry: '轮胎',
      primary_keywords: ['Pilot Sport 5', '静音轮胎', '米其林轮胎'],
      platforms: ['deepseek']
    },
    [{ name: '马牌' }],
    { count: 10 }
  );

  assert.match(question, /行业\/场景核心关键词：静音轮胎/);
  assert.match(question, /品牌专属词\/产品型号：Pilot Sport 5、米其林轮胎/);
  assert.doesNotMatch(question, /品牌核心关键词\/产品词/);
});

test('builds generation prompt with competitor aliases for realistic comparison prompts', () => {
  const question = PromptSuggestionService.buildGenerationQuestion(
    {
      name: 'Goodie AI',
      industry: 'AI 品牌监测',
      primary_keywords: ['AI 搜索可见度'],
      platforms: ['deepseek']
    },
    [
      { name: 'Elmo', aliases: ['elmo.so', 'AI Monitor'] },
      { name: 'Profound', aliases: ['Profound AI'] }
    ],
    { count: 10 }
  );

  assert.match(question, /主要竞品：Elmo、elmo\.so、AI Monitor、Profound、Profound AI/);
});

test('allows generating more than 20 prompt suggestions up to the bulk limit', () => {
  const question = PromptSuggestionService.buildGenerationQuestion(
    {
      name: '米其林',
      industry: '轮胎',
      primary_keywords: ['静音轮胎'],
      platforms: ['deepseek']
    },
    [],
    { count: 80 }
  );

  assert.match(question, /请生成 80 条/);
});

test('splits bulk prompt generation into model-safe AI generation batches', () => {
  assert.deepEqual(PromptSuggestionService.buildGenerationBatches(8), [8]);
  assert.deepEqual(PromptSuggestionService.buildGenerationBatches(25), [20, 5]);
  assert.deepEqual(PromptSuggestionService.buildGenerationBatches(80), [20, 20, 20, 20]);
});

test('does not truncate parsed suggestions at 20 items', () => {
  const payload = Array.from({ length: 25 }, (_, index) => ({
    question: `轮胎选购场景${index + 1}`,
    tags: ['购买决策']
  }));

  const suggestions = PromptSuggestionService.parseSuggestions(JSON.stringify(payload), {
    requestedCount: 25
  });

  assert.equal(suggestions.length, 25);
  assert.equal(suggestions[24].question, '轮胎选购场景25');
});

test('merges generated prompt batches without a 20 item cap', () => {
  const groups = [
    Array.from({ length: 20 }, (_, index) => ({ question: `轮胎场景A${index + 1}`, tags: ['购买决策'] })),
    Array.from({ length: 20 }, (_, index) => ({ question: `轮胎场景B${index + 1}`, tags: ['竞品对比'] }))
  ];

  const suggestions = PromptSuggestionService.mergeSuggestions(groups, { requestedCount: 40 });

  assert.equal(suggestions.length, 40);
  assert.equal(suggestions[39].question, '轮胎场景B20');
});

test('filters already tracked prompt questions from generated suggestions', () => {
  const suggestions = PromptSuggestionService.parseSuggestions(JSON.stringify([
    { question: '静音轮胎怎么选？', tags: ['购买决策'] },
    { question: '新能源车轮胎推荐', tags: ['购买决策'] },
    { question: '马牌和米其林哪个好', tags: ['竞品对比'] }
  ]), {
    requestedCount: 6,
    excludeQuestions: ['静音轮胎怎么选', '马牌和米其林哪个好']
  });

  assert.deepEqual(suggestions, [
    { question: '新能源车轮胎推荐', tags: ['购买决策'] }
  ]);
});

test('orchestrates bulk generation across AI generation batches', async () => {
  const calls = [];
  const result = await PromptSuggestionService.generateSuggestions(
    {
      name: '米其林',
      industry: '轮胎',
      primary_keywords: ['静音轮胎'],
      platforms: ['deepseek']
    },
    [{ name: '马牌' }],
    {
      count: 45,
      queryPlatform: async (platform, question) => {
        calls.push({ platform, question });
        const match = question.match(/当前只生成本批 (\d+) 条/);
        const count = Number(match?.[1] || 0);
        const prefix = calls.length === 1 ? 'A' : calls.length === 2 ? 'B' : 'C';
        return {
          success: true,
          data: {
            response: JSON.stringify(Array.from({ length: count }, (_, index) => ({
              question: `轮胎场景${prefix}${index + 1}`,
              tags: ['购买决策']
            })))
          }
        };
      },
      extractResponseText: (data) => data.response
    }
  );

  assert.equal(result.requested_count, 45);
  assert.deepEqual(result.batches, [20, 20, 5]);
  assert.equal(calls.length, 3);
  assert.equal(result.suggestions.length, 45);
  assert.equal(result.suggestions[44].question, '轮胎场景C5');
});

test('passes existing tracked prompt questions into each AI generation batch', async () => {
  const calls = [];
  const result = await PromptSuggestionService.generateSuggestions(
    {
      name: '米其林',
      industry: '轮胎',
      primary_keywords: ['静音轮胎'],
      platforms: ['deepseek']
    },
    [],
    {
      count: 3,
      excludeQuestions: ['静音轮胎怎么选'],
      queryPlatform: async (platform, question) => {
        calls.push({ platform, question });
        return {
          success: true,
          data: {
            response: JSON.stringify([
              { question: '静音轮胎怎么选', tags: ['购买决策'] },
              { question: '新能源车轮胎推荐', tags: ['购买决策'] },
              { question: '轮胎哪个品牌耐磨', tags: ['口碑评价'] }
            ])
          }
        };
      },
      extractResponseText: (data) => data.response
    }
  );

  assert.match(calls[0].question, /已生成过的问题不要重复：静音轮胎怎么选/);
  assert.equal(result.suggestions.some((item) => item.question === '静音轮胎怎么选'), false);
  assert.equal(result.suggestions.length, 2);
});

test('tops up prompt generation when AI returns fewer suggestions than requested', async () => {
  const calls = [];
  const result = await PromptSuggestionService.generateSuggestions(
    {
      name: '米其林',
      industry: '轮胎',
      primary_keywords: ['静音轮胎'],
      platforms: ['deepseek']
    },
    [{ name: '马牌' }],
    {
      count: 25,
      queryPlatform: async (platform, question) => {
        calls.push({ platform, question });
        const match = question.match(/当前只生成本批 (\d+) 条/);
        const requested = Number(match?.[1] || 0);
        const count = calls.length === 1 ? 10 : requested;
        return {
          success: true,
          data: {
            response: JSON.stringify(Array.from({ length: count }, (_, index) => ({
              question: `补齐场景${calls.length}-${index + 1}`,
              tags: ['购买决策']
            })))
          }
        };
      },
      extractResponseText: (data) => data.response
    }
  );

  assert.equal(result.requested_count, 25);
  assert.deepEqual(result.batches, [20, 5, 10]);
  assert.equal(calls.length, 3);
  assert.equal(result.suggestions.length, 25);
  assert.match(calls[2].question, /已生成过的问题不要重复/);
});

test('tops up generation when brand-direct suggestions are filtered out', async () => {
  const calls = [];
  const result = await PromptSuggestionService.generateSuggestions(
    {
      name: '米其林',
      industry: '轮胎',
      primary_keywords: ['静音轮胎'],
      platforms: ['deepseek']
    },
    [{ name: '马牌' }],
    {
      count: 6,
      maxBrandQuestionRatio: 0.15,
      queryPlatform: async (platform, question) => {
        calls.push({ platform, question });
        const rows = calls.length === 1
          ? Array.from({ length: 6 }, (_, index) => ({
            question: `米其林问题${index + 1}`,
            tags: ['品牌直问']
          }))
          : Array.from({ length: 6 }, (_, index) => ({
            question: `静音轮胎场景${index + 1}`,
            tags: ['购买决策']
          }));
        return { success: true, data: { response: JSON.stringify(rows) } };
      },
      extractResponseText: (data) => data.response
    }
  );

  assert.equal(calls.length, 2);
  assert.equal(result.suggestions.length, 6);
  assert.equal(result.suggestions.some((item) => /米其林/.test(item.question)), false);
  assert.match(calls[1].question, /当前只生成本批 6 条/);
});

test('limits brand-named generated suggestions after parsing', () => {
  const suggestions = PromptSuggestionService.parseSuggestions(JSON.stringify([
    { question: '米其林轮胎值得买吗', tags: ['品牌直问'] },
    { question: '米其林适合新能源车吗', tags: ['产品适配'] },
    { question: 'Michelin 和马牌哪个好', tags: ['竞品对比'] },
    { question: '静音轮胎怎么选', tags: ['购买决策'] },
    { question: '新能源车轮胎推荐', tags: ['购买决策'] },
    { question: '轮胎哪个品牌耐磨', tags: ['口碑评价'] }
  ]), {
    project: { name: '米其林', aliases: ['Michelin'] },
    requestedCount: 10,
    maxBrandQuestionRatio: 0.15
  });

  const brandNamed = suggestions.filter((item) => /米其林|Michelin/i.test(item.question));
  assert.equal(brandNamed.length, 1);
  assert.equal(suggestions.some((item) => item.question === '静音轮胎怎么选'), true);
  assert.equal(suggestions.some((item) => item.question === '新能源车轮胎推荐'), true);
});

test('keeps valid generic suggestions after over-returned brand-direct suggestions', () => {
  const suggestions = PromptSuggestionService.parseSuggestions(JSON.stringify([
    { question: '米其林轮胎值得买吗', tags: ['品牌直问'] },
    { question: '米其林适合新能源车吗', tags: ['产品适配'] },
    { question: 'Michelin 和马牌哪个好', tags: ['竞品对比'] },
    { question: '静音轮胎怎么选', tags: ['购买决策'] },
    { question: '新能源车轮胎推荐', tags: ['购买决策'] },
    { question: '轮胎哪个品牌耐磨', tags: ['口碑评价'] }
  ]), {
    project: { name: '米其林', aliases: ['Michelin'] },
    requestedCount: 4,
    maxBrandQuestionRatio: 0.25
  });

  assert.deepEqual(suggestions.map((item) => item.question), [
    '米其林轮胎值得买吗',
    '静音轮胎怎么选',
    '新能源车轮胎推荐',
    '轮胎哪个品牌耐磨'
  ]);
});

test('does not force brand-direct suggestions for small batches', () => {
  const suggestions = PromptSuggestionService.parseSuggestions(JSON.stringify([
    { question: '米其林轮胎值得买吗', tags: ['品牌直问'] },
    { question: '静音轮胎怎么选', tags: ['购买决策'] },
    { question: '新能源车轮胎推荐', tags: ['购买决策'] },
    { question: '轮胎哪个品牌耐磨', tags: ['口碑评价'] },
    { question: '家用车轮胎推荐', tags: ['购买决策'] },
    { question: '雨天轮胎怎么选', tags: ['风险顾虑'] }
  ]), {
    project: { name: '米其林', aliases: ['Michelin'] },
    requestedCount: 6,
    maxBrandQuestionRatio: 0.15
  });

  const brandNamed = suggestions.filter((item) => /米其林|Michelin/i.test(item.question));
  assert.equal(brandNamed.length, 0);
  assert.equal(suggestions.some((item) => item.question === '静音轮胎怎么选'), true);
});

test('limits compact brand-named generated suggestions after parsing', () => {
  const suggestions = PromptSuggestionService.parseSuggestions(JSON.stringify([
    { question: 'GoodieAI GEO适合谁', tags: ['品牌直问'] },
    { question: 'GoodieAI工具好用吗', tags: ['品牌直问'] },
    { question: 'AI搜索优化怎么做', tags: ['购买决策'] },
    { question: '品牌可见度监测工具推荐', tags: ['购买决策'] },
    { question: 'GEO工具怎么选', tags: ['购买决策'] },
    { question: '生成式搜索监测方案', tags: ['产品适配'] }
  ]), {
    project: { name: 'Goodie AI', aliases: [] },
    requestedCount: 10,
    maxBrandQuestionRatio: 0.15
  });

  const brandNamed = suggestions.filter((item) => /GoodieAI/i.test(item.question));
  assert.equal(brandNamed.length, 1);
  assert.equal(suggestions.some((item) => item.question === 'AI搜索优化怎么做'), true);
});

test('limits model-like brand product suggestions as brand-direct prompts', () => {
  const suggestions = PromptSuggestionService.parseSuggestions(JSON.stringify([
    { question: 'Pilot Sport 5适合SUV吗', tags: ['产品适配'] },
    { question: 'Pilot Sport 5雨天安全吗', tags: ['风险顾虑'] },
    { question: 'Pilot Sport 5贵不贵', tags: ['价格成本'] },
    { question: '静音轮胎怎么选', tags: ['购买决策'] },
    { question: '新能源车轮胎推荐', tags: ['购买决策'] },
    { question: '轮胎哪个品牌耐磨', tags: ['口碑评价'] }
  ]), {
    project: { name: '米其林', aliases: ['Michelin'], primary_keywords: ['Pilot Sport 5', '静音轮胎'] },
    requestedCount: 10,
    maxBrandQuestionRatio: 0.15
  });

  const productNamed = suggestions.filter((item) => /Pilot Sport 5/i.test(item.question));
  assert.equal(productNamed.length, 1);
  assert.equal(suggestions.some((item) => item.question === '静音轮胎怎么选'), true);
});
