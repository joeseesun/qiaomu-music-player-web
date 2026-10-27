const PLAYLISTS = [
  {
    id: "990fd5fe-70d2-449b-8a4d-3cb0a7d3e805",
    name: "官方精选",
    title: "Staff Picks",
  },
  {
    id: "0d597d0c-cdb2-4f9c-b4da-57931929f0d0",
    name: "Best of v6",
    title: "Best of v6",
  },
];
const UUID = /^[a-f0-9]{8}-[a-f0-9-]{27}$/i;
function mediaUrl(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password) return "";
    if (
      !/^(?:cdn\d?\.suno\.(?:ai|com)|[a-z0-9-]+\.cloudfront\.net)$/.test(
        u.hostname,
      )
    )
      return "";
    return u.href;
  } catch {
    return "";
  }
}
// Decode data, never evaluate JavaScript from the remote page.
function parsePlaylist(html, playlistId) {
  const chunks = [];
  for (const match of html.matchAll(
    /self\.__next_f\.push\((\[.*?\])\)<\/script>/gs,
  )) {
    try {
      const value = JSON.parse(match[1]);
      if (typeof value[1] === "string") chunks.push(value[1]);
    } catch {}
  }
  const flight = chunks.join("");
  let feed;
  function walk(value) {
    if (!value || typeof value !== "object") return;
    if (value.feedContainerId === playlistId && Array.isArray(value.items))
      feed = value;
    for (const child of Object.values(value)) walk(child);
  }
  for (const line of flight.split("\n")) {
    const colon = line.indexOf(":");
    try {
      walk(JSON.parse(line.slice(colon + 1)));
    } catch {}
  }
  if (!feed || !feed.items.length)
    throw new Error("歌单数据暂时无法解析，已保留上次结果");
  if ((feed.feedMetadata?.songCount || feed.itemCount || 0) > feed.items.length)
    throw new Error("歌单返回了部分歌曲，已保留完整缓存；需要更新分页适配");
  const tracks = feed.items
    .filter((item) => item.contentType === "clip")
    .map((item, index) => {
      const c = item.contentItem;
      if (!c || !UUID.test(c.id)) throw new Error("歌单歌曲数据不完整");
      const audio = (c.mediaUrls || []).find(
        (m) => m.delivery === "progressive" && mediaUrl(m.url),
      );
      return {
        id: c.id,
        title: String(c.title || "未命名").slice(0, 240),
        artist: String(c.displayName || c.handle || "Suno").slice(0, 160),
        tags: String(c.metadata?.tags || c.displayTags || "").slice(0, 4000),
        audioUrl: mediaUrl(audio?.url || c.audioUrl),
        coverUrl: mediaUrl(c.imageUrl),
        duration: Number(c.metadata?.duration) || 0,
        plays: Number(c.playCount) || 0,
        sourceUrl: `https://suno.com/song/${c.id}`,
        position: index + 1,
        canRemix: c.metadata?.canRemix === true,
        addedAt: item.addedAt || null,
      };
    });
  if (!tracks.length) throw new Error("歌单暂时没有可识别的歌曲");
  return { title: feed.feedTitle, tracks };
}
async function fetchPlaylist(id) {
  if (!PLAYLISTS.some((p) => p.id === id)) throw new Error("unknown_playlist");
  const response = await fetch(`https://suno.com/playlist/${id}`, {
    signal: AbortSignal.timeout(25000),
    headers: { "user-agent": "QiaomuMusic/1.0 (+https://music.qiaomu.ai)" },
  });
  if (!response.ok)
    throw new Error(`Suno 返回 ${response.status}，已保留上次结果`);
  const text = await response.text();
  if (text.length > 8 * 1024 * 1024) throw new Error("歌单响应过大");
  return parsePlaylist(text, id);
}
function shanghaiDate(now = new Date()) {
  return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}
function scheduledDay(now = new Date()) {
  return new Date(now.getTime() + 8 * 3600000 - 9 * 3600000)
    .toISOString()
    .slice(0, 10);
}
module.exports = {
  PLAYLISTS,
  parsePlaylist,
  fetchPlaylist,
  mediaUrl,
  shanghaiDate,
  scheduledDay,
};
