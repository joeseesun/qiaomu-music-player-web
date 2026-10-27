// Suno aligned lyrics may split one bracketed direction across timed rows,
// and put sung text on the next untimed row. Keep the supplied timing/order.
export function parseLyrics(lyrics = '') {
  const lines = [];
  let inDirection = false;
  let lastTime;
  String(lyrics).split(/\r?\n/).forEach((raw, index) => {
    const stamps = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)]
      .map(m => Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number('0.' + m[3]) : 0));
    if (stamps.length) lastTime = stamps[stamps.length - 1];
    const body = raw.replace(/\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/g, '');
    let text = '';
    for (const char of body) {
      if (char === '[') inDirection = true;
      else if (char === ']') inDirection = false;
      else if (!inDirection) text += char;
    }
    text = text.trim();
    if (!text) return;
    const times = stamps.length ? stamps : [lastTime];
    times.forEach(time => lines.push({ id: `${index}-${time ?? 'plain'}`, text, ...(time === undefined ? {} : { time }) }));
  });
  return lines.sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity));
}
