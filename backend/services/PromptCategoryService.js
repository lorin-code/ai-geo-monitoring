const CATEGORIES = [
  { name: '竞品对比', patterns: [/竞品|对比|相比|区别|差异|不同|优劣|对标|[\u4e00-\u9fffA-Za-z0-9]{1,24}(?<!性价)比[\u4e00-\u9fffA-Za-z0-9]{1,24}好|哪.*更|哪.*好|\bpk\b|[\u4e00-\u9fffA-Za-z0-9]\s*(vs|pk)\s*[\u4e00-\u9fffA-Za-z0-9]/i] },
  { name: '替代方案', patterns: [/替代|平替|类似|换成/] },
  { name: '价格成本', patterns: [/价格|费用|多少钱|成本|预算|便宜|贵不贵|性价比|省钱|划算/] },
  { name: '风险顾虑', patterns: [/风险|缺点|问题|坑|售后|质量|靠谱|可靠|安全|翻车|踩雷/] },
  { name: '口碑评价', patterns: [/评价|口碑|体验|怎么样|好不好/] },
  { name: '产品适配', patterns: [/适合.*(suv|SUV|车型|家用车|新能源车|通勤|雨天|雪地|团队|企业|公司|业务|客服|内容|运营|销售|营销|开发|场景)/] },
  { name: '购买决策', patterns: [/买|购买|选择|怎么选|推荐|首选|值得|适合|排行榜|排名|榜单|前十|十大/] },
  { name: '产品适配', patterns: [/适配|场景|需求|参数/] }
];
const CATEGORY_NAMES = new Set(CATEGORIES.map((item) => item.name));

class PromptCategoryService {
  normalizeTags(prompt) {
    return Array.isArray(prompt?.tags)
      ? prompt.tags.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
  }

  derive(prompt) {
    const explicit = String(prompt?.category || prompt?.prompt_category || '').trim();
    if (CATEGORY_NAMES.has(explicit)) return explicit;

    const tags = this.normalizeTags(prompt);
    for (const category of CATEGORIES) {
      if (tags.includes(category.name)) return category.name;
    }

    const question = String(prompt?.question || '');
    const matched = CATEGORIES.find((category) => category.patterns.some((pattern) => pattern.test(question)));
    return matched?.name || '未分类';
  }
}

module.exports = new PromptCategoryService();
