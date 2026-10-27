const CACHE = 'qiaomu-audio-v1';
const MB = 1024 * 1024;
// Complete public files only on disk. Private candidates stay in tab memory.
export class AudioCache {
  constructor({ storage = globalThis.caches, fetcher = globalThis.fetch?.bind(globalThis), urls = URL,
    origin = globalThis.location?.origin, maxBytes = 64 * MB, maxTracks = 6, maxFile = 20 * MB } = {}) {
    Object.assign(this, { storage, fetcher, urls, origin, maxBytes, maxTracks, maxFile });
    this.memory = new Map(); this.pins = new Map(); this.queue = []; this.active = null; this.epoch = 0;
  }
  key(url) {
    try { const u = new URL(url, this.origin); return u.origin === this.origin && u.pathname.startsWith('/music/') ? u.href : ''; } catch { return ''; }
  }
  source(url) {
    const key = this.key(url); const entry = this.memory.get(key);
    if (entry) { this.memory.delete(key); this.memory.set(key, entry); return entry.src; }
    return url;
  }
  pin(owner, url) { this.pins.set(owner, this.key(url)); }
  stop() {
    this.queue.splice(0).forEach(item => item.resolve(false));
    this.active?.controller.abort();
  }
  clearPrivate() {
    this.epoch++;
    if (this.active && !this.active.public) this.active.controller.abort();
    this.queue = this.queue.filter(item => { if (!item.public) item.resolve(false); return item.public; });
    for (const [key, item] of this.memory) if (!item.public) { this.urls.revokeObjectURL(item.src); this.memory.delete(key); }
  }
  preload(url, isPublic = false) {
    const key = this.key(url);
    if (!key || this.memory.has(key)) return Promise.resolve(Boolean(key));
    if (this.active?.key === key) return this.active.promise;
    const existing = this.queue.find(item => item.key === key); if (existing) return existing.promise;
    let resolve; const promise = new Promise(r => { resolve = r; });
    const item = { key, public: isPublic, promise, resolve, controller: new AbortController(), epoch: this.epoch };
    // A moving pointer must not enqueue the entire library.
    while (this.queue.length >= 2) this.queue.shift().resolve(false);
    this.queue.push(item); void this.drain(); return promise;
  }
  async drain() {
    if (this.active) return;
    const item = this.queue.shift(); if (!item) return;
    this.active = item;
    try { item.resolve(await this.load(item)); } catch { item.resolve(false); }
    finally { this.active = null; void this.drain(); }
  }
  async disk() { try { return await this.storage?.open(CACHE); } catch { return undefined; } }
  async load(item) {
    const disk = item.public ? await this.disk() : undefined;
    let response = await disk?.match(item.key);
    const hit = Boolean(response);
    if (!response) {
      if (globalThis.navigator?.connection?.saveData) return false;
      response = await this.fetcher(item.key, { credentials: item.public ? 'omit' : 'same-origin', signal: item.controller.signal, priority: 'low' });
    }
    if (item.controller.signal.aborted || response.status !== 200 || !/^audio\//.test(response.headers.get('content-type') || '')) return false;
    if (Number(response.headers.get('content-length')) > this.maxFile) return false;
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > this.maxFile || item.controller.signal.aborted) { await reader.cancel(); return false; }
      chunks.push(value);
    }
    if (item.controller.signal.aborted || (!item.public && item.epoch !== this.epoch)) return false;
    const blob = new Blob(chunks, { type: response.headers.get('content-type') });
    this.memory.set(item.key, { src: this.urls.createObjectURL(blob), size, public: item.public });
    this.trimMemory();
    const policy = response.headers.get('cache-control') || '';
    if (disk && /\bpublic\b/.test(policy) && !/no-store|private/.test(policy)) {
      try {
        if (hit) await disk.delete(item.key); // Move the recently used song to the end.
        await disk.put(item.key, new Response(blob, { headers: { 'content-type': blob.type, 'content-length': String(size), 'cache-control': policy } }));
        const keys = await disk.keys(); let bytes = 0; const sizes = [];
        for (const key of keys) { const r = await disk.match(key); const n = Number(r.headers.get('content-length')) || this.maxFile; sizes.push(n); bytes += n; }
        while (keys.length > this.maxTracks || bytes > this.maxBytes) { await disk.delete(keys.shift()); bytes -= sizes.shift(); }
      } catch { /* Storage denied/quota full: streaming and memory playback still work. */ }
    }
    return true;
  }
  trimMemory() {
    let bytes = [...this.memory.values()].reduce((n, item) => n + item.size, 0);
    for (const [key, item] of this.memory) {
      if (this.memory.size <= this.maxTracks && bytes <= this.maxBytes) break;
      if ([...this.pins.values()].includes(key)) continue;
      this.urls.revokeObjectURL(item.src); this.memory.delete(key); bytes -= item.size;
    }
  }
}
export const audioCache = new AudioCache();
