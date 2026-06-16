(function () {
  const currentScript = document.currentScript;
  const scriptUrl = currentScript && currentScript.src ? new URL(currentScript.src, window.location.href) : null;
  const defaultBase = scriptUrl ? scriptUrl.origin : "__QIAOMU_DEFAULT_BASE_URL__";

  const formatTime = (value) => {
    if (!Number.isFinite(value)) return "0:00";
    const minutes = Math.floor(value / 60);
    const seconds = String(Math.floor(value % 60)).padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

  const parseLrcTime = (raw) => {
    const match = /^(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?$/.exec(raw);
    if (!match) return null;
    const fraction = match[3] ? Number(`0.${match[3].padEnd(3, "0").slice(0, 3)}`) : 0;
    return Number(match[1]) * 60 + Number(match[2]) + fraction;
  };

  const parseLyrics = (lyrics = "") => {
    const lines = [];
    String(lyrics || "").split(/\r?\n/).forEach((rawLine, index) => {
      const trimmed = rawLine.trim();
      if (!trimmed) return;
      const stamps = [...trimmed.matchAll(/\[([0-9]{1,2}:[0-9]{2}(?:[.:][0-9]{1,3})?)\]/g)]
        .map((match) => parseLrcTime(match[1]))
        .filter((value) => value !== null);
      const text = trimmed.replace(/\[[^\]]+\]/g, "").trim();
      if (!text && stamps.length) return;
      if (stamps.length) {
        stamps.forEach((stamp) => lines.push({ id: `${index}-${stamp}-${text}`, text, time: stamp }));
      } else {
        lines.push({ id: `${index}-${trimmed}`, text: trimmed });
      }
    });
    return lines.sort((a, b) => (a.time ?? Number.MAX_SAFE_INTEGER) - (b.time ?? Number.MAX_SAFE_INTEGER));
  };

  const getActiveLine = (lines, time, duration) => {
    if (!lines.length) return 0;
    if (lines.some((line) => typeof line.time === "number")) {
      let active = 0;
      lines.forEach((line, index) => {
        if (typeof line.time === "number" && line.time <= time + 0.08) active = index;
      });
      return active;
    }
    if (!duration) return 0;
    return Math.max(0, Math.min(lines.length - 1, Math.floor((time / duration) * lines.length)));
  };

  class QiaomuMusicPlayer extends HTMLElement {
    static get observedAttributes() {
      return ["track", "base-url"];
    }

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.track = null;
      this.lines = [];
      this.activeLine = 0;
      this.isReady = false;
      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: block;
            color: var(--qiaomu-player-text, #f5f1e8);
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }
          .player {
            container-type: inline-size;
            overflow: hidden;
            border: 1px solid var(--qiaomu-player-border, rgba(255,255,255,.14));
            border-radius: var(--qiaomu-player-radius, 8px);
            background: var(--qiaomu-player-bg, #11100e);
            box-shadow: var(--qiaomu-player-shadow, 0 18px 50px rgba(0,0,0,.28));
          }
          .main {
            display: grid;
            grid-template-columns: 116px minmax(0, 1fr);
            gap: 14px;
            padding: 14px;
          }
          .cover {
            width: 116px;
            aspect-ratio: 1;
            border-radius: 6px;
            background: linear-gradient(135deg, #d8b46a, #8fb8c8 54%, #b88974);
            object-fit: cover;
          }
          .fallback {
            display: grid;
            place-items: center;
            color: rgba(17,16,14,.82);
            font-size: 34px;
            font-weight: 900;
          }
          .meta {
            min-width: 0;
            display: grid;
            align-content: start;
            gap: 8px;
          }
          .source, .artist, .time {
            color: var(--qiaomu-player-muted, rgba(245,241,232,.66));
            font-size: 12px;
          }
          .title {
            margin: 0;
            overflow: hidden;
            color: var(--qiaomu-player-text, #f5f1e8);
            font-size: 20px;
            line-height: 1.15;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .controls {
            display: grid;
            grid-template-columns: 42px minmax(0, 1fr) auto;
            gap: 10px;
            align-items: center;
            margin-top: 4px;
          }
          button {
            width: 42px;
            height: 42px;
            border: 0;
            border-radius: 999px;
            background: var(--qiaomu-player-accent, #d8b46a);
            color: #11100e;
            cursor: pointer;
            font: inherit;
            font-size: 16px;
            font-weight: 800;
          }
          input[type="range"] {
            width: 100%;
            accent-color: var(--qiaomu-player-accent, #d8b46a);
          }
          .lyrics {
            max-height: var(--qiaomu-player-lyrics-height, 168px);
            overflow: auto;
            border-top: 1px solid var(--qiaomu-player-border, rgba(255,255,255,.14));
            padding: 8px 14px 14px;
            scroll-behavior: smooth;
          }
          .line {
            margin: 0;
            padding: 6px 0;
            color: var(--qiaomu-player-muted, rgba(245,241,232,.58));
            font-size: 14px;
            line-height: 1.45;
            transition: color .18s ease, transform .18s ease;
          }
          .line.active {
            color: var(--qiaomu-player-text, #f5f1e8);
            transform: translateX(4px);
          }
          .empty {
            padding: 18px;
            color: var(--qiaomu-player-muted, rgba(245,241,232,.66));
            font-size: 14px;
          }
          @container (max-width: 420px) {
            .main { grid-template-columns: 82px minmax(0, 1fr); gap: 12px; padding: 12px; }
            .cover { width: 82px; }
            .title { font-size: 17px; }
            .controls { grid-template-columns: 38px minmax(0, 1fr); }
            .time { display: none; }
            button { width: 38px; height: 38px; }
          }
        </style>
        <section class="player" part="player">
          <div class="empty">Loading Qiaomu Music...</div>
        </section>
      `;
    }

    connectedCallback() {
      this.load();
    }

    attributeChangedCallback() {
      if (this.isConnected) this.load();
    }

    get baseUrl() {
      return (this.getAttribute("base-url") || defaultBase).replace(/\/$/, "");
    }

    async load() {
      const trackKey = this.getAttribute("track");
      const endpoint = trackKey
        ? `${this.baseUrl}/api/public/tracks/${encodeURIComponent(trackKey)}`
        : `${this.baseUrl}/api/public/tracks`;
      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        if (!response.ok) throw new Error("track_not_found");
        const data = await response.json();
        this.track = data.track || data.tracks?.[0] || null;
        this.lines = parseLyrics(this.track?.lyrics || "");
        this.render();
      } catch (error) {
        this.shadowRoot.querySelector(".player").innerHTML = '<div class="empty">This track is unavailable.</div>';
        this.dispatchEvent(new CustomEvent("qiaomu-error", { detail: { error }, bubbles: true }));
      }
    }

    render() {
      if (!this.track) {
        this.shadowRoot.querySelector(".player").innerHTML = '<div class="empty">No published tracks yet.</div>';
        return;
      }
      const cover = this.track.coverUrl
        ? `<img class="cover" part="cover" src="${this.track.coverUrl}" alt="">`
        : `<div class="cover fallback" part="cover">${(this.track.title || "QM").slice(0, 2).toUpperCase()}</div>`;
      this.shadowRoot.querySelector(".player").innerHTML = `
        <div class="main">
          ${cover}
          <div class="meta">
            <div class="source">${this.escape(this.track.source || "Qiaomu Music")}</div>
            <h2 class="title">${this.escape(this.track.title)}</h2>
            <div class="artist">${this.escape([this.track.artist, this.track.album].filter(Boolean).join(" · "))}</div>
            <div class="controls">
              <button type="button" class="play" aria-label="Play">▶</button>
              <input class="seek" type="range" min="0" max="1000" value="0" aria-label="Playback progress">
              <span class="time">0:00</span>
            </div>
          </div>
        </div>
        <div class="lyrics" part="lyrics"></div>
        <audio preload="metadata" crossorigin="anonymous"></audio>
      `;
      this.audio = this.shadowRoot.querySelector("audio");
      this.audio.src = this.track.audioUrl;
      this.button = this.shadowRoot.querySelector(".play");
      this.seek = this.shadowRoot.querySelector(".seek");
      this.timeLabel = this.shadowRoot.querySelector(".time");
      this.lyricsEl = this.shadowRoot.querySelector(".lyrics");
      this.button.addEventListener("click", () => this.toggle());
      this.seek.addEventListener("input", () => {
        if (this.audio.duration) this.audio.currentTime = (Number(this.seek.value) / 1000) * this.audio.duration;
      });
      this.audio.addEventListener("play", () => {
        this.button.textContent = "||";
        this.dispatchEvent(new CustomEvent("qiaomu-play", { detail: { track: this.track }, bubbles: true }));
      });
      this.audio.addEventListener("pause", () => {
        this.button.textContent = "▶";
        this.dispatchEvent(new CustomEvent("qiaomu-pause", { detail: { track: this.track }, bubbles: true }));
      });
      this.audio.addEventListener("timeupdate", () => this.updateProgress());
      this.audio.addEventListener("loadedmetadata", () => this.updateProgress());
      this.renderLyrics();
      this.isReady = true;
      this.dispatchEvent(new CustomEvent("qiaomu-ready", { detail: { track: this.track }, bubbles: true }));
    }

    renderLyrics() {
      const lines = this.lines.length ? this.lines : [{ id: "empty", text: "No lyrics for this track yet." }];
      this.lyricsEl.innerHTML = lines.map((line, index) => (
        `<p class="line${index === this.activeLine ? " active" : ""}" data-index="${index}">${this.escape(line.text)}</p>`
      )).join("");
    }

    updateProgress() {
      const time = this.audio.currentTime || 0;
      const duration = this.audio.duration || 0;
      this.seek.value = duration ? String(Math.round((time / duration) * 1000)) : "0";
      this.timeLabel.textContent = `${formatTime(time)}${duration ? ` / ${formatTime(duration)}` : ""}`;
      const nextLine = getActiveLine(this.lines, time, duration);
      if (nextLine === this.activeLine) return;
      this.activeLine = nextLine;
      this.lyricsEl.querySelectorAll(".line").forEach((line, index) => line.classList.toggle("active", index === nextLine));
      this.lyricsEl.querySelector(`.line[data-index="${nextLine}"]`)?.scrollIntoView({ block: "center" });
    }

    async toggle() {
      if (!this.audio) return;
      if (this.audio.paused) {
        await this.audio.play();
      } else {
        this.audio.pause();
      }
    }

    escape(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }
  }

  if (!customElements.get("qiaomu-music-player")) {
    customElements.define("qiaomu-music-player", QiaomuMusicPlayer);
  }
}());
