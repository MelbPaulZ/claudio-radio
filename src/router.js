/**
 * 意图分流
 *
 * 简单指令直连 —— 不浪费 token 和延迟
 * 自然语言 → 走 Claude
 */

// Allow a few trailing particles/characters (吧/啊/呢/歌/个/下/一下) so "下一首吧"、"下一首歌"、"跳一下" 这种也能被识别
const SIMPLE = {
  next: /^(下一首|换一首|下一个|下首|跳过|跳一下|换首歌|再来一首|next|skip)[歌吧啊呢。，！\s]*$/i,
  pause: /^(暂停|停一下|pause|停)[吧啊呢。，！\s]*$/i,
  play: /^(播放|继续播|play|继续)[吧啊呢。，！\s]*$/i,
  louder: /^(大声点|声音大点|音量(\+|\+\+|加))/,
  softer: /^(小声点|声音小点|音量(-|--|减))/,
};

export function intent(input) {
  if (!input) return { kind: 'brain' };
  const s = input.trim();
  for (const [name, re] of Object.entries(SIMPLE)) {
    if (re.test(s)) return { kind: 'command', action: name };
  }
  return { kind: 'brain' };
}
