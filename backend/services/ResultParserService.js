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
    if (aiResponse?.choices?.[0]?.message?.content) {
      return aiResponse.choices[0].message.content;
    }
    if (aiResponse?.data?.choices?.[0]?.message?.content) {
      return aiResponse.data.choices[0].message.content;
    }
    if (typeof aiResponse === 'string') {
      return aiResponse;
    }
    return JSON.stringify(aiResponse);
  }
}

module.exports = new ResultParserService();