const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 3068);
const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const MUSIC_DIR = path.join(DATA_DIR, "music");
const COVER_DIR = path.join(DATA_DIR, "covers");
const DB_FILE = path.join(DATA_DIR, "tracks.json");
const PUBLIC_DIR = process.env.PUBLIC_DIR || (fs.existsSync(path.join(__dirname, "dist")) ? path.join(__dirname, "dist") : path.join(__dirname, "public"));
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const SESSION_SECRET = process.env.SESSION_SECRET || (ADMIN_PASSWORD
  ? crypto.createHash("sha256").update(ADMIN_PASSWORD).digest("hex")
  : crypto.randomBytes(32).toString("hex"));
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 120 * 1024 * 1024);

const audioTypes = new Map([
  ["audio/mpeg", ".mp3"],
  ["audio/mp3", ".mp3"],
  ["audio/wav", ".wav"],
  ["audio/x-wav", ".wav"],
  ["audio/mp4", ".m4a"],
  ["audio/aac", ".aac"],
  ["audio/flac", ".flac"],
  ["audio/x-flac", ".flac"],
  ["audio/ogg", ".ogg"]
]);

const imageTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
  ["image/svg+xml", ".svg"]
]);

const mimeByExt = new Map([
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
  [".m4a", "audio/mp4"],
  [".aac", "audio/aac"],
  [".flac", "audio/flac"],
  [".ogg", "audio/ogg"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".svg", "image/svg+xml"]
]);

function send(res, status, body, headers = {}) {
  const isText = typeof body === "string";
  const payload = isText ? body : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": isText ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers
  });
  res.end(payload);
}

function cleanText(value, fallback = "") {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  return text.slice(0, 160) || fallback;
}

function slugify(value) {
  return cleanText(value, "track")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "track";
}

async function ensureStorage() {
  await fsp.mkdir(MUSIC_DIR, { recursive: true });
  await fsp.mkdir(COVER_DIR, { recursive: true });
  try {
    await fsp.access(DB_FILE);
  } catch {
    await fsp.writeFile(DB_FILE, "[]\n");
  }
}

async function readTracks() {
  await ensureStorage();
  try {
    const parsed = JSON.parse(await fsp.readFile(DB_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed.map(normalizeTrack) : [];
  } catch {
    return [];
  }
}

function normalizeTrack(track) {
  const file = track.file || "";
  const coverFile = track.coverFile || "";
  return {
    id: track.id || crypto.randomUUID(),
    title: cleanText(track.title, "Untitled Track"),
    artist: cleanText(track.artist, "Qiaomu"),
    source: cleanText(track.source, "Suno"),
    album: cleanText(track.album, "Qiaomu Radio"),
    file,
    coverFile,
    size: Number(track.size || 0),
    contentType: track.contentType || "audio/mpeg",
    lyrics: String(track.lyrics || ""),
    published: track.published !== false,
    createdAt: track.createdAt || new Date().toISOString(),
    updatedAt: track.updatedAt || track.createdAt || new Date().toISOString(),
    url: file ? `/music/${encodeURIComponent(file)}` : "",
    coverUrl: coverFile ? `/covers/${encodeURIComponent(coverFile)}` : ""
  };
}

async function writeTracks(tracks) {
  await fsp.writeFile(DB_FILE, `${JSON.stringify(tracks.map(normalizeTrack), null, 2)}\n`);
}

async function listTracks({ admin = false } = {}) {
  const tracks = await readTracks();
  const files = new Set(await fsp.readdir(MUSIC_DIR).catch(() => []));
  return tracks
    .filter((track) => files.has(track.file))
    .filter((track) => admin || track.published)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
}

function makeSession() {
  const payload = `${Date.now()}.${crypto.randomBytes(18).toString("hex")}`;
  return `${payload}.${sign(payload)}`;
}

function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const item of raw.split(";")) {
    const [key, ...rest] = item.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function isAdmin(req) {
  const token = getCookie(req, "qm_admin");
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const age = Date.now() - Number(parts[0]);
  if (!Number.isFinite(age) || age < 0 || age > 7 * 24 * 60 * 60 * 1000) return false;
  const expected = sign(payload);
  if (parts[2].length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(parts[2]), Buffer.from(expected));
}

function requireAdmin(req, res) {
  if (isAdmin(req)) return true;
  send(res, 401, { error: "unauthorized" });
  return false;
}

function requireAdminConfig(res) {
  if (ADMIN_PASSWORD) return true;
  send(res, 503, { error: "admin_not_configured" });
  return false;
}

async function readBody(req, limit = MAX_UPLOAD_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("payload_too_large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const raw = await readBody(req, 1024 * 1024);
  return raw.length ? JSON.parse(raw.toString("utf8")) : {};
}

function parseMultipart(buffer, contentType) {
  const boundary = /boundary=([^;]+)/i.exec(contentType || "")?.[1]?.replace(/^"|"$/g, "");
  if (!boundary) throw new Error("missing_boundary");
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = [];
  let cursor = buffer.indexOf(delimiter);
  while (cursor !== -1) {
    cursor += delimiter.length;
    if (buffer[cursor] === 45 && buffer[cursor + 1] === 45) break;
    if (buffer[cursor] === 13 && buffer[cursor + 1] === 10) cursor += 2;
    const headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), cursor);
    if (headerEnd === -1) break;
    const headerText = buffer.slice(cursor, headerEnd).toString("utf8");
    let next = buffer.indexOf(delimiter, headerEnd + 4);
    if (next === -1) break;
    let body = buffer.slice(headerEnd + 4, next);
    if (body.slice(-2).toString() === "\r\n") body = body.slice(0, -2);
    const disposition = /content-disposition:\s*form-data;([^\r\n]+)/i.exec(headerText)?.[1] || "";
    const name = /name="([^"]+)"/i.exec(disposition)?.[1] || "";
    const filename = /filename="([^"]*)"/i.exec(disposition)?.[1] || "";
    const type = /content-type:\s*([^\r\n]+)/i.exec(headerText)?.[1]?.trim().toLowerCase() || "";
    if (name) parts.push({ name, filename, type, body });
    cursor = next;
  }
  return parts;
}

function fieldsFromParts(parts) {
  const fields = {};
  const files = {};
  for (const part of parts) {
    if (part.filename) {
      files[part.name] = part;
    } else {
      fields[part.name] = part.body.toString("utf8");
    }
  }
  return { fields, files };
}

async function saveUploadFile(part, dir, basename, allowedTypes) {
  if (!part || !part.body.length) return "";
  const ext = allowedTypes.get(part.type);
  if (!ext) throw new Error("unsupported_file_type");
  const file = `${basename}${ext}`;
  await fsp.writeFile(path.join(dir, file), part.body);
  return file;
}

async function createTrackFromMultipart(req, res) {
  const body = await readBody(req);
  const { fields, files } = fieldsFromParts(parseMultipart(body, req.headers["content-type"]));
  const audio = files.audio;
  if (!audio) {
    send(res, 400, { error: "missing_audio" });
    return;
  }

  const title = cleanText(fields.title, audio.filename.replace(/\.[^.]+$/, "") || "Untitled Track");
  const artist = cleanText(fields.artist, "Qiaomu");
  const source = cleanText(fields.source, "Suno");
  const album = cleanText(fields.album, "Qiaomu Radio");
  const id = crypto.randomUUID();
  const basename = `${slugify(title)}-${id.slice(0, 8)}`;
  const audioFile = await saveUploadFile(audio, MUSIC_DIR, basename, audioTypes);
  const coverFile = await saveUploadFile(files.cover, COVER_DIR, basename, imageTypes);
  const track = normalizeTrack({
    id,
    title,
    artist,
    source,
    album,
    file: audioFile,
    coverFile,
    size: audio.body.length,
    contentType: audio.type,
    lyrics: fields.lyrics || "",
    published: fields.published !== "false",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  const tracks = await readTracks();
  tracks.push(track);
  await writeTracks(tracks);
  send(res, 201, track);
}

async function updateTrack(req, res, id) {
  const body = await readJson(req);
  const tracks = await readTracks();
  const index = tracks.findIndex((track) => track.id === id);
  if (index === -1) {
    send(res, 404, { error: "not_found" });
    return;
  }
  tracks[index] = normalizeTrack({
    ...tracks[index],
    title: body.title ?? tracks[index].title,
    artist: body.artist ?? tracks[index].artist,
    source: body.source ?? tracks[index].source,
    album: body.album ?? tracks[index].album,
    lyrics: body.lyrics ?? tracks[index].lyrics,
    published: typeof body.published === "boolean" ? body.published : tracks[index].published,
    updatedAt: new Date().toISOString()
  });
  await writeTracks(tracks);
  send(res, 200, tracks[index]);
}

async function deleteTrack(res, id) {
  const tracks = await readTracks();
  const track = tracks.find((item) => item.id === id);
  if (!track) {
    send(res, 404, { error: "not_found" });
    return;
  }
  await fsp.rm(path.join(MUSIC_DIR, track.file), { force: true }).catch(() => {});
  if (track.coverFile) await fsp.rm(path.join(COVER_DIR, track.coverFile), { force: true }).catch(() => {});
  await writeTracks(tracks.filter((item) => item.id !== id));
  send(res, 200, { ok: true });
}

async function handleLegacyUpload(req, res, url) {
  const type = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  const ext = audioTypes.get(type);
  if (!ext) {
    send(res, 415, { error: "unsupported_audio_type" });
    return;
  }
  const body = await readBody(req);
  const title = cleanText(url.searchParams.get("title"), "Untitled Track");
  const id = crypto.randomUUID();
  const file = `${slugify(title)}-${id.slice(0, 8)}${ext}`;
  await fsp.writeFile(path.join(MUSIC_DIR, file), body);
  const track = normalizeTrack({
    id,
    title,
    artist: cleanText(url.searchParams.get("artist"), "Qiaomu"),
    source: cleanText(url.searchParams.get("source"), "Suno"),
    file,
    size: body.length,
    contentType: type,
    published: true,
    createdAt: new Date().toISOString()
  });
  const tracks = await readTracks();
  tracks.push(track);
  await writeTracks(tracks);
  send(res, 201, track);
}

function serveFile(res, filePath, headers = {}) {
  const stream = fs.createReadStream(filePath);
  stream.on("open", () => {
    res.writeHead(200, headers);
    stream.pipe(res);
  });
  stream.on("error", () => send(res, 404, "Not found"));
}

async function serveAudio(req, res, filePath) {
  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    send(res, 404, "Not found");
    return;
  }
  const contentType = mimeByExt.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
  const range = req.headers.range;
  if (!range) {
    res.writeHead(200, {
      "content-type": contentType,
      "content-length": stat.size,
      "cache-control": "public, max-age=31536000, immutable",
      "accept-ranges": "bytes"
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  const start = match?.[1] ? Number(match[1]) : 0;
  const end = match?.[2] ? Number(match[2]) : stat.size - 1;
  if (!match || start >= stat.size || end >= stat.size || start > end) {
    res.writeHead(416, { "content-range": `bytes */${stat.size}` });
    res.end();
    return;
  }
  res.writeHead(206, {
    "content-type": contentType,
    "content-length": end - start + 1,
    "content-range": `bytes ${start}-${end}/${stat.size}`,
    "cache-control": "public, max-age=31536000, immutable",
    "accept-ranges": "bytes"
  });
  fs.createReadStream(filePath, { start, end }).pipe(res);
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/health") {
    send(res, 200, { ok: true, service: "qiaomu-music-player" });
    return;
  }

  if (url.pathname === "/api/login" && req.method === "POST") {
    if (!requireAdminConfig(res)) return;
    const body = await readJson(req);
    if (body.password !== ADMIN_PASSWORD) {
      send(res, 401, { error: "invalid_password" });
      return;
    }
    send(res, 200, { ok: true }, {
      "set-cookie": `qm_admin=${encodeURIComponent(makeSession())}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`
    });
    return;
  }

  if (url.pathname === "/api/logout" && req.method === "POST") {
    send(res, 200, { ok: true }, { "set-cookie": "qm_admin=; HttpOnly; Path=/; Max-Age=0" });
    return;
  }

  if (url.pathname === "/api/me") {
    send(res, 200, { admin: isAdmin(req) });
    return;
  }

  if (url.pathname === "/api/tracks") {
    send(res, 200, { tracks: await listTracks({ admin: false }) });
    return;
  }

  if (url.pathname === "/api/admin/tracks") {
    if (!requireAdmin(req, res)) return;
    if (req.method === "GET") {
      send(res, 200, { tracks: await listTracks({ admin: true }) });
      return;
    }
    if (req.method === "POST") {
      await createTrackFromMultipart(req, res);
      return;
    }
  }

  const adminTrackMatch = /^\/api\/admin\/tracks\/([^/]+)$/.exec(url.pathname);
  if (adminTrackMatch) {
    if (!requireAdmin(req, res)) return;
    const id = decodeURIComponent(adminTrackMatch[1]);
    if (req.method === "PATCH") {
      await updateTrack(req, res, id);
      return;
    }
    if (req.method === "DELETE") {
      await deleteTrack(res, id);
      return;
    }
  }

  if (url.pathname === "/api/upload" && req.method === "PUT") {
    if (!requireAdminConfig(res)) return;
    if (!isAdmin(req) && req.headers["x-upload-token"] !== ADMIN_PASSWORD) {
      send(res, 401, { error: "unauthorized" });
      return;
    }
    await handleLegacyUpload(req, res, url);
    return;
  }

  if (url.pathname.startsWith("/music/")) {
    const safeName = path.basename(decodeURIComponent(url.pathname.replace("/music/", "")));
    await serveAudio(req, res, path.join(MUSIC_DIR, safeName));
    return;
  }

  if (url.pathname.startsWith("/covers/")) {
    const safeName = path.basename(decodeURIComponent(url.pathname.replace("/covers/", "")));
    const filePath = path.join(COVER_DIR, safeName);
    const contentType = mimeByExt.get(path.extname(filePath).toLowerCase()) || "image/jpeg";
    serveFile(res, filePath, { "content-type": contentType, "cache-control": "public, max-age=31536000, immutable" });
    return;
  }

  const safePath = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  let filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    send(res, 403, "Forbidden");
    return;
  }
  try {
    const stat = await fsp.stat(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, "index.html");
  } catch {
    filePath = path.join(PUBLIC_DIR, "index.html");
  }
  const ext = path.extname(filePath);
  const contentType = ext === ".css" ? "text/css; charset=utf-8" : ext === ".js" ? "text/javascript; charset=utf-8" : ext === ".svg" ? "image/svg+xml" : "text/html; charset=utf-8";
  const cacheControl = path.basename(filePath) === "index.html" ? "no-cache" : "public, max-age=31536000, immutable";
  serveFile(res, filePath, { "content-type": contentType, "cache-control": cacheControl });
}

ensureStorage().then(() => {
  http.createServer((req, res) => {
    route(req, res).catch((error) => {
      const status = error.message === "payload_too_large" ? 413 : 500;
      send(res, status, { error: error.message || "server_error" });
    });
  }).listen(PORT, HOST, () => {
    console.log(`qiaomu music player listening on ${HOST}:${PORT}`);
  });
});
