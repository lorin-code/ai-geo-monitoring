const ResultParserService = require('./ResultParserService');

module.exports = {
  attachCitations(data) {
    const results = data?.search_info?.search_results || data?.choices?.[0]?.message?.search_info?.search_results || [];
    const text = ResultParserService.extractResponseText(data);
    const references = new Set([...text.matchAll(/\[ref_(\d+)\]/g)].map((match) => Number(match[1])));
    const annotations = results.filter((item) => references.has(Number(item.index)))
      .filter((item) => { try { return ['https:', 'http:'].includes(new URL(item.url).protocol); } catch { return false; } })
      .map((item) => ({ type: 'url_citation', url_citation: { url: item.url, title: item.title || '' } }));
    const output = structuredClone(data);
    // Search candidates are not all citations. Keep only sources actually referenced in the answer.
    delete output.search_info;
    const message = output.choices?.[0]?.message;
    if (message) {
      delete message.search_info;
      message.annotations = [...(Array.isArray(message.annotations) ? message.annotations : []), ...annotations];
    }
    return output;
  }
};
