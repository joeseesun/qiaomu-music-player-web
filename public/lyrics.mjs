// Suno's word alignment keeps original lyric-line boundaries as blank rows.
// Ordinary LRC, in contrast, has one complete lyric per timestamped row.
export function parseLyrics(lyrics = '') {
  const blocks = [[]];
  let inDirection = false;
  let splitTimedDirection = false;
  let lastTime;
  let hasBlank = false;
  String(lyrics).split(/\r?\n/).forEach((raw, index) => {
    if (!raw.trim()) {
      hasBlank = true;
      if (blocks.at(-1).length) blocks.push([]);
      return;
    }
    const stamps = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)]
      .map(m => Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number('0.' + m[3]) : 0));
    if (stamps.length) lastTime = stamps[stamps.length - 1];
    if (inDirection && stamps.length) splitTimedDirection = true;
    const body = raw.replace(/\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/g, '');
    let text = '';
    for (const char of body) {
      if (char === '[') inDirection = true;
      else if (char === ']') inDirection = false;
      else if (!inDirection) text += char;
    }
    text = text.trim();
    if (!text) {
      // A section heading also ends the preceding lyric, even without a blank.
      if (body.includes('[') && blocks.at(-1).length) blocks.push([]);
      return;
    }
    blocks.at(-1).push({ text, index, times: stamps.length ? stamps : [lastTime] });
  });
  const isWord = row => row.times[0] !== undefined && /^[\p{L}\p{N}'’]+[,!.?;:]?$/u.test(row.text) && (!/\p{Script=Han}/u.test(row.text) || row.text.length <= 2);
  const wordAligned = hasBlank && (splitTimedDirection || blocks.some(block => block.length >= 3 && block.filter(isWord).length >= block.length * 0.75));
  const lines = [];
  for (const block of blocks) {
    if (!block.length) continue;
    if (wordAligned && block.length > 1 && block.every(row => row.times.length === 1 && row.times[0] !== undefined)) {
      const text = block.map(row => row.text).join(' ')
        .replace(/([\p{Script=Han}]) +(?=[\p{Script=Han}])/gu, '$1')
        .replace(/([（(]) +/g, '$1').replace(/ +([)）,!.?;:，。！？；：])/g, '$1');
      // A standalone opening parenthesis is untimed; use the first sung word.
      const first = block.find(row => /[\p{L}\p{N}]/u.test(row.text)) || block[0];
      lines.push({ id: `${first.index}-${first.times[0]}`, text, time: first.times[0] });
    } else {
      for (const row of block) for (const time of row.times) {
        lines.push({ id: `${row.index}-${time ?? 'plain'}`, text: row.text, ...(time === undefined ? {} : { time }) });
      }
    }
  }
  return lines.sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity));
}
