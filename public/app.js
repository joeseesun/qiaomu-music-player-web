const audio = document.querySelector("#audio");
const playlist = document.querySelector("#playlist");
const adminList = document.querySelector("#adminList");
const radioView = document.querySelector("#radioView");
const adminView = document.querySelector("#adminView");
const playButton = document.querySelector("#playButton");
const prevButton = document.querySelector("#prevButton");
const nextButton = document.querySelector("#nextButton");
const shuffleButton = document.querySelector("#shuffleButton");
const repeatButton = document.querySelector("#repeatButton");
const seekBar = document.querySelector("#seekBar");
const currentTimeEl = document.querySelector("#currentTime");
const durationEl = document.querySelector("#duration");
const coverImage = document.querySelector("#coverImage");
const coverFallback = document.querySelector("#coverFallback");
const nowTitle = document.querySelector("#nowTitle");
const nowArtist = document.querySelector("#nowArtist");
const nowSource = document.querySelector("#nowSource");
const lyricsBox = document.querySelector("#lyricsBox");
const trackCount = document.querySelector("#trackCount");
const autoplayState = document.querySelector("#autoplayState");
const loginForm = document.querySelector("#loginForm");
const adminPanel = document.querySelector("#adminPanel");
const logoutButton = document.querySelector("#logoutButton");
const uploadForm = document.querySelector("#uploadForm");
const statusEl = document.querySelector("#status");

let tracks = [];
let adminTracks = [];
let activeIndex = 0;
let shuffle = false;
let repeat = false;
let admin = false;

function setStatus(text, type = "") {
  statusEl.textContent = text;
  statusEl.className = `status ${type}`.trim();
}

function formatTime(value) {
  if (!Number.isFinite(value)) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function currentTrack() {
  return tracks[activeIndex];
}

function initials(track) {
  return (track?.title || "QM").slice(0, 2).toUpperCase();
}

function setTrack(index, autoplay = false) {
  if (!tracks.length) return;
  activeIndex = (index + tracks.length) % tracks.length;
  const track = currentTrack();
  audio.src = track.url;
  nowTitle.textContent = track.title;
  nowArtist.textContent = `${track.artist} · ${track.album || track.source}`;
  nowSource.textContent = track.source || "Qiaomu Radio";
  lyricsBox.textContent = track.lyrics?.trim() || "这首歌还没有歌词。";
  coverFallback.textContent = initials(track);
  if (track.coverUrl) {
    coverImage.src = track.coverUrl;
    coverImage.classList.remove("hidden");
    coverFallback.classList.add("hidden");
  } else {
    coverImage.removeAttribute("src");
    coverImage.classList.add("hidden");
    coverFallback.classList.remove("hidden");
  }
  renderPlaylist();
  if (autoplay) play();
}

function renderPlaylist() {
  trackCount.textContent = String(tracks.length);
  playlist.innerHTML = "";
  if (!tracks.length) {
    playlist.innerHTML = '<p class="muted">暂无公开歌曲</p>';
    return;
  }
  tracks.forEach((track, index) => {
    const button = document.createElement("button");
    button.className = `track ${index === activeIndex ? "active" : ""}`;
    button.innerHTML = `
      <span class="thumb">${track.coverUrl ? `<img src="${track.coverUrl}" alt="">` : initials(track)}</span>
      <span class="track-copy"><strong></strong><small></small></span>
      <span class="track-state">${index === activeIndex ? "●" : ""}</span>
    `;
    button.querySelector("strong").textContent = track.title;
    button.querySelector("small").textContent = `${track.artist} · ${track.source}`;
    button.addEventListener("click", () => setTrack(index, true));
    playlist.append(button);
  });
}

async function play() {
  try {
    await audio.play();
    playButton.textContent = "⏸";
    autoplayState.textContent = shuffle ? "Shuffle" : "On Air";
  } catch {
    autoplayState.textContent = "点播放开始";
  }
}

function pause() {
  audio.pause();
  playButton.textContent = "▶";
  autoplayState.textContent = "Paused";
}

function next() {
  if (!tracks.length) return;
  const index = shuffle ? Math.floor(Math.random() * tracks.length) : activeIndex + 1;
  setTrack(index, true);
}

function prev() {
  setTrack(activeIndex - 1, true);
}

async function loadTracks() {
  const response = await fetch("/api/tracks", { cache: "no-store" });
  const data = await response.json();
  tracks = data.tracks || [];
  renderPlaylist();
  if (tracks.length) {
    setTrack(Math.min(activeIndex, tracks.length - 1), true);
  }
}

async function loadAdminTracks() {
  const response = await fetch("/api/admin/tracks", { cache: "no-store" });
  if (!response.ok) return;
  const data = await response.json();
  adminTracks = data.tracks || [];
  renderAdmin();
}

function renderAdmin() {
  adminList.innerHTML = "";
  if (!adminTracks.length) {
    adminList.innerHTML = '<p class="muted">暂无歌曲</p>';
    return;
  }
  for (const track of adminTracks) {
    const item = document.createElement("form");
    item.className = "admin-track";
    item.innerHTML = `
      <img class="admin-cover" src="${track.coverUrl || ""}" alt="">
      <input name="title" value="">
      <input name="artist" value="">
      <input name="source" value="">
      <label class="publish"><input name="published" type="checkbox"> 发布</label>
      <textarea name="lyrics"></textarea>
      <div class="admin-actions">
        <button name="save">保存</button>
        <button name="delete" type="button" class="danger">删除</button>
      </div>
    `;
    item.querySelector('[name="title"]').value = track.title;
    item.querySelector('[name="artist"]').value = track.artist;
    item.querySelector('[name="source"]').value = track.source;
    item.querySelector('[name="published"]').checked = track.published;
    item.querySelector('[name="lyrics"]').value = track.lyrics || "";
    if (!track.coverUrl) item.querySelector(".admin-cover").classList.add("empty");
    item.addEventListener("submit", async (event) => {
      event.preventDefault();
      await saveTrack(track.id, item);
    });
    item.querySelector('[name="delete"]').addEventListener("click", () => deleteTrack(track.id));
    adminList.append(item);
  }
}

async function saveTrack(id, form) {
  const body = {
    title: form.title.value,
    artist: form.artist.value,
    source: form.source.value,
    lyrics: form.lyrics.value,
    published: form.published.checked
  };
  const response = await fetch(`/api/admin/tracks/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  setStatus(response.ok ? "已保存" : "保存失败", response.ok ? "ok" : "error");
  await loadAdminTracks();
  await loadTracks();
}

async function deleteTrack(id) {
  if (!confirm("确定删除这首歌？")) return;
  const response = await fetch(`/api/admin/tracks/${id}`, { method: "DELETE" });
  setStatus(response.ok ? "已删除" : "删除失败", response.ok ? "ok" : "error");
  await loadAdminTracks();
  await loadTracks();
}

async function checkLogin() {
  const response = await fetch("/api/me", { cache: "no-store" });
  admin = (await response.json()).admin;
  loginForm.classList.toggle("hidden", admin);
  adminPanel.classList.toggle("hidden", !admin);
  logoutButton.classList.toggle("hidden", !admin);
  if (admin) await loadAdminTracks();
}

document.querySelectorAll(".rail-item").forEach((button) => {
  button.addEventListener("click", async () => {
    document.querySelectorAll(".rail-item").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    const adminMode = button.dataset.view === "admin";
    radioView.classList.toggle("hidden", adminMode);
    adminView.classList.toggle("hidden", !adminMode);
    if (adminMode) await checkLogin();
  });
});

playButton.addEventListener("click", () => audio.paused ? play() : pause());
nextButton.addEventListener("click", next);
prevButton.addEventListener("click", prev);
shuffleButton.addEventListener("click", () => {
  shuffle = !shuffle;
  shuffleButton.classList.toggle("active", shuffle);
});
repeatButton.addEventListener("click", () => {
  repeat = !repeat;
  repeatButton.classList.toggle("active", repeat);
});
audio.addEventListener("ended", () => repeat ? setTrack(activeIndex, true) : next());
audio.addEventListener("timeupdate", () => {
  if (!audio.duration) return;
  seekBar.value = Math.round((audio.currentTime / audio.duration) * 1000);
  currentTimeEl.textContent = formatTime(audio.currentTime);
  durationEl.textContent = formatTime(audio.duration);
});
seekBar.addEventListener("input", () => {
  if (audio.duration) audio.currentTime = (Number(seekBar.value) / 1000) * audio.duration;
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = document.querySelector("#passwordInput").value;
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password })
  });
  setStatus(response.ok ? "已登录" : "密码错误", response.ok ? "ok" : "error");
  await checkLogin();
});

logoutButton.addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  await checkLogin();
});

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(uploadForm);
  form.set("published", uploadForm.published.checked ? "true" : "false");
  setStatus("上传中...");
  const response = await fetch("/api/admin/tracks", { method: "POST", body: form });
  setStatus(response.ok ? "上传完成" : "上传失败", response.ok ? "ok" : "error");
  if (response.ok) uploadForm.reset();
  await loadAdminTracks();
  await loadTracks();
});

loadTracks();
