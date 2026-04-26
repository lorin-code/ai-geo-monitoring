import { visit, SKIP } from 'unist-util-visit';

// remark 插件：将匹配到的关键词片段转换为 emphasis 节点
// 在 ReactMarkdown 中通过 components 将 em 渲染为 <mark>
// 标准用法：在 ReactMarkdown 中以 [plugin, options] 的形式传入
export default function remarkKeywordHighlight(options: any = {}) {
  const { keywords: inputKeywords = [], englishWordBoundary = true } = options || {};
  const keywords = Array.isArray(inputKeywords)
    ? Array.from(new Set(inputKeywords.map((k: any) => String(k || '').trim()).filter(Boolean)))
    : [];

  if (keywords.length === 0) {
    return () => {};
  }

  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = keywords.map((kw) => {
    const e = escape(kw);
    if (englishWordBoundary && /^[A-Za-z]+$/.test(kw)) {
      return `\\b${e}\\b`;
    }
    return e;
  });
  const regex = new RegExp(patterns.join('|'), 'gi');

  return function transformer(tree: any) {
    visit(tree, 'text', (node: any, index: any, parent: any) => {
      try {
        if (!parent || typeof index !== 'number') return;
        if (typeof node.value !== 'string') return;
        const value = node.value;
        if (!regex.test(value)) return; // 若无匹配，跳过
        regex.lastIndex = 0;
        const newNodes: any[] = [];
        let lastIndex = 0;
        for (const match of value.matchAll(regex)) {
          const start = match.index || 0;
          const matchText = match[0];
          const end = start + matchText.length;
          if (start > lastIndex) {
            newNodes.push({ type: 'text', value: value.slice(lastIndex, start) });
          }
          newNodes.push({ type: 'emphasis', children: [{ type: 'text', value: matchText }] });
          lastIndex = end;
        }
        if (lastIndex < value.length) {
          newNodes.push({ type: 'text', value: value.slice(lastIndex) });
        }
        if (Array.isArray(parent.children)) {
          parent.children.splice(index, 1, ...newNodes);
        }
        // 跳过新插入的节点，避免重复访问
        return SKIP;
      } catch {
        return SKIP;
      }
    });
  };
}
