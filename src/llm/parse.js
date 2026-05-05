import { log } from '../log.js';

// -------- 解析 DJ 响应 --------
export function parseDjResponse(raw) {
  if (!raw) return emptyResponse('模型没返回内容');
  // 有时模型会在 JSON 前后多一点解释，抠出第一个 { 到最后一个 }
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) {
    log.warn('claude 输出不是 JSON:', raw.slice(0, 200));
    return emptyResponse(raw.slice(0, 200));
  }
  try {
    const obj = JSON.parse(m[0]);
    return {
      say: String(obj.say || '').trim(),
      play: Array.isArray(obj.play) ? obj.play.filter(x => x?.id).map(x => ({ id: Number(x.id), reason: String(x.reason || '') })) : [],
      immediate: Boolean(obj.immediate),
      clearQueue: Boolean(obj.clearQueue),
      playNext: Boolean(obj.playNext),
      reason: String(obj.reason || ''),
    };
  } catch (e) {
    log.warn('JSON parse 失败:', e.message);
    log.warn('原始内容:', m[0].slice(0, 500));
    return emptyResponse('');
  }
}

function emptyResponse(fallbackSay) {
  return { say: fallbackSay, play: [], immediate: false, clearQueue: false, playNext: false, reason: '' };
}
