/**
 * 并发限制执行函数
 * @param {Array} items 要处理的数组
 * @param {Function} processor 处理函数，接收item和index，返回Promise
 * @param {number} concurrency 并发数量，默认5
 * @returns {Promise<Array>} 处理结果数组
 */
export async function concurrentLimit(items, processor, concurrency = 5) {
  if (!items || !items.length) return [];

  const results = new Array(items.length);
  const queue = [...items];
  let index = 0;

  // 执行一批任务
  const runBatch = async () => {
    while (index < items.length) {
      const currentIndex = index++;
      if (currentIndex >= items.length) break;

      try {
        results[currentIndex] = await processor(items[currentIndex], currentIndex);
      } catch (error) {
        results[currentIndex] = error;
      }
    }
  };

  // 创建并发任务
  const workers = Array(Math.min(concurrency, items.length)).fill().map(() => runBatch());
  await Promise.all(workers);
  return results;
}

/**
 * 顺序执行函数（并发数为1）
 * @param {Array} items 要处理的数组
 * @param {Function} processor 处理函数，接收item和index，返回Promise
 * @returns {Promise<Array>} 处理结果数组
 */
export async function sequential(items, processor) {
  return concurrentLimit(items, processor, 1);
}

/**
 * 带延迟的顺序执行，避免触发速率限制
 * @param {Array} items 要处理的数组
 * @param {Function} processor 处理函数，接收item和index，返回Promise
 * @param {number} delayMs 延迟毫秒数，默认100ms
 * @returns {Promise<Array>} 处理结果数组
 */
export async function sequentialWithDelay(items, processor, delayMs = 100) {
  const results = [];
  for (let i = 0; i < items.length; i++) {
    try {
      results.push(await processor(items[i], i));
    } catch (error) {
      results.push(error);
    }
    if (i < items.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return results;
}