class ResultParserService {
  // 仅解析并返回原始文本
  parseAIResponse(aiResponse) {
    const responseText = this.extractResponseText(aiResponse);
    return {
      originalText: responseText,
      parsingStatus: 'completed'
    };
  }

  // 提取响应文本（保留通用兼容逻辑）
  extractResponseText(aiResponse) {
    if (typeof aiResponse === 'string') {
      return aiResponse;
    }
    const candidates = [
      aiResponse?.choices?.[0]?.message?.content,
      aiResponse?.data?.choices?.[0]?.message?.content,
      aiResponse?.choices?.[0]?.text,
      aiResponse?.data?.choices?.[0]?.text,
      aiResponse?.output,
      aiResponse?.data?.output,
      aiResponse?.output_text,
      aiResponse?.data?.output_text,
      aiResponse?.text,
      aiResponse?.data?.text,
      aiResponse?.answer,
      aiResponse?.data?.answer,
      aiResponse?.result,
      aiResponse?.data?.result,
      aiResponse?.response,
      aiResponse?.data?.response
    ];
    const hasKnownTextShape = candidates.some((candidate) => candidate !== undefined);
    for (const candidate of candidates) {
      const text = this.normalizeTextContent(candidate);
      if (text) return text;
    }
    if (hasKnownTextShape) return '';
    return '';
  }

  normalizeTextContent(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((item) => this.normalizeTextContent(item))
        .filter(Boolean)
        .join('\n');
    }
    if (content && typeof content === 'object') {
      return this.normalizeTextContent(content.text || content.content || content.output_text || content.answer || content.result || content.response);
    }
    return '';
  }
}

module.exports = new ResultParserService();
