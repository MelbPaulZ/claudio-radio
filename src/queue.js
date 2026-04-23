/**
 * 决定已解析好的一批新歌 (resolved) 如何跟现有 queue 合并。
 *
 * 优先级: shouldClear > playNext > 默认追加
 *   - shouldClear=true        → 旧队列清空，新歌成为整个队列
 *   - playNext=true 且不清队列 → 插到队头（当前这首播完立刻接上；后面已排的保留）
 *   - 其它                    → 追加到队尾
 *
 * 纯函数。不改动入参，返回新数组。
 */
export function mergePlay({ queue = [], resolved = [], shouldClear = false, playNext = false } = {}) {
  if (shouldClear) return [...resolved];
  if (playNext && resolved.length > 0) return [...resolved, ...queue];
  return [...queue, ...resolved];
}
