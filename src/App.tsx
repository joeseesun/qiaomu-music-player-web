import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent, TouchEvent } from "react";
import Coverflow from "react-coverflow";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Edit3,
  Eye,
  EyeOff,
  Home,
  ListMusic,
  Lock,
  LogOut,
  Menu,
  Music2,
  Palette,
  Pause,
  Play,
  Repeat2,
  Search,
  Settings,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Tags,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  X
} from "lucide-react";
import { Button, Card, Light, Waveform } from "@nafr/echo-ui";

type Track = {
  id: string;
  title: string;
  artist: string;
  source: string;
  album: string;
  file: string;
  coverFile?: string;
  size: number;
  contentType: string;
  lyrics: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  url: string;
  coverUrl?: string;
};

type View = "home" | "discover" | "settings" | "admin";
type Playlist = {
  id: string;
  name: string;
  description: string;
  trackIds: string[];
};
type DiscoveryFacet = {
  id: string;
  name: string;
  description: string;
  trackIds: string[];
};
type ThemeId = "amber" | "cyan" | "rose" | "mono";
type VisualizerStyle = "ring" | "halo" | "bars";
type VisualizerPosition = "center" | "edge" | "bottom";
type PlayerSettings = {
  theme: ThemeId;
  visualizerEnabled: boolean;
  visualizerStyle: VisualizerStyle;
  visualizerPosition: VisualizerPosition;
};
type LyricLine = {
  id: string;
  text: string;
  time?: number;
};

const SETTINGS_KEY = "qiaomu-music-player-settings";
const PLAY_COUNTS_KEY = "qiaomu-music-player-play-counts";

const DEFAULT_SETTINGS: PlayerSettings = {
  theme: "amber",
  visualizerEnabled: true,
  visualizerStyle: "ring",
  visualizerPosition: "center"
};

const THEMES: Record<ThemeId, {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  foreground: string;
  background: string;
}> = {
  amber: {
    name: "Warm Studio",
    primary: "#d8b46a",
    secondary: "#9db6c7",
    accent: "#b88974",
    foreground: "#f3eee4",
    background: "#11100e"
  },
  cyan: {
    name: "Blue Note",
    primary: "#8fb8c8",
    secondary: "#c6b48d",
    accent: "#6f8f9f",
    foreground: "#edf4f5",
    background: "#0d1214"
  },
  rose: {
    name: "Velvet Room",
    primary: "#c88e9b",
    secondary: "#c8aa73",
    accent: "#8d7898",
    foreground: "#f8eef0",
    background: "#120e10"
  },
  mono: {
    name: "Graphite",
    primary: "#d8d3c8",
    secondary: "#9ea5a7",
    accent: "#b8aa96",
    foreground: "#f0eee8",
    background: "#0f0f0e"
  }
};

const readSettings = (): PlayerSettings => {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || "{}") as Partial<PlayerSettings>;
    return {
      theme: parsed.theme && parsed.theme in THEMES ? parsed.theme : DEFAULT_SETTINGS.theme,
      visualizerEnabled: typeof parsed.visualizerEnabled === "boolean" ? parsed.visualizerEnabled : DEFAULT_SETTINGS.visualizerEnabled,
      visualizerStyle: parsed.visualizerStyle && ["ring", "halo", "bars"].includes(parsed.visualizerStyle)
        ? parsed.visualizerStyle
        : DEFAULT_SETTINGS.visualizerStyle,
      visualizerPosition: parsed.visualizerPosition && ["center", "edge", "bottom"].includes(parsed.visualizerPosition)
        ? parsed.visualizerPosition
        : DEFAULT_SETTINGS.visualizerPosition
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

const readPlayCounts = (): Record<string, number> => {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PLAY_COUNTS_KEY) || "{}");
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed)
      .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
      .map(([key, value]) => [key, value as number]));
  } catch {
    return {};
  }
};

const settingsStyle = (settings: PlayerSettings): CSSProperties => {
  const theme = THEMES[settings.theme];
  return {
    "--echo-primary": theme.primary,
    "--echo-secondary": theme.secondary,
    "--echo-accent": theme.accent,
    "--echo-foreground": theme.foreground,
    "--theme-primary": theme.primary,
    "--theme-secondary": theme.secondary,
    "--theme-accent": theme.accent,
    "--theme-background": theme.background
  } as CSSProperties;
};

const formatTime = (value: number) => {
  if (!Number.isFinite(value)) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
};

const formatSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const makeWave = (seed: string) => {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return Array.from({ length: 96 }, (_, index) => {
    const wobble = Math.sin((index + hash % 17) * 0.34) * 0.32;
    const pulse = Math.sin((index + hash % 29) * 0.11) * 0.24;
    return Math.max(0.08, Math.min(1, 0.46 + wobble + pulse + ((hash >> (index % 8)) & 7) / 28));
  });
};

const parseLrcTime = (raw: string) => {
  const match = raw.match(/^(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?$/);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const fraction = match[3] ? Number(`0.${match[3].padEnd(3, "0").slice(0, 3)}`) : 0;
  return minutes * 60 + seconds + fraction;
};

const parseLyrics = (lyrics = ""): LyricLine[] => {
  const lines: LyricLine[] = [];
  lyrics.split(/\r?\n/).forEach((rawLine, index) => {
    const trimmed = rawLine.trim();
    if (!trimmed) return;
    const stamps = [...trimmed.matchAll(/\[([0-9]{1,2}:[0-9]{2}(?:[.:][0-9]{1,3})?)\]/g)]
      .map((match) => parseLrcTime(match[1]))
      .filter((value): value is number => value !== null);
    const text = trimmed.replace(/\[[^\]]+\]/g, "").trim();
    if (!text && stamps.length) return;
    if (stamps.length) {
      stamps.forEach((stamp) => lines.push({ id: `${index}-${stamp}-${text}`, text, time: stamp }));
      return;
    }
    lines.push({ id: `${index}-${trimmed}`, text: trimmed });
  });
  return lines.sort((a, b) => (a.time ?? Number.MAX_SAFE_INTEGER) - (b.time ?? Number.MAX_SAFE_INTEGER));
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const getActiveLyricIndex = (lines: LyricLine[], time: number, duration: number) => {
  if (!lines.length) return 0;
  const timed = lines.some((line) => typeof line.time === "number");
  if (timed) {
    let active = 0;
    for (let index = 0; index < lines.length; index += 1) {
      const stamp = lines[index].time;
      if (typeof stamp === "number" && stamp <= time + 0.08) active = index;
    }
    return active;
  }
  return duration ? clamp(Math.floor((time / duration) * lines.length), 0, lines.length - 1) : 0;
};

const includesAny = (value: string, terms: string[]) => terms.some((term) => value.includes(term));

const buildPlaylists = (tracks: Track[]): Playlist[] => {
  const byText = (terms: string[]) => tracks
    .filter((track) => includesAny([track.title, track.artist, track.source, track.album].join(" ").toLowerCase(), terms))
    .map((track) => track.id);
  const allIds = tracks.map((track) => track.id);
  const candidates: Playlist[] = [
    { id: "all", name: "全部歌曲", description: "完整曲库", trackIds: allIds },
    { id: "dance", name: "舞曲电台", description: "适合连续播放", trackIds: allIds },
    { id: "latin", name: "Latin / Dancehall", description: "热带律动", trackIds: byText(["latin", "reggaeton", "dancehall", "baile"]) },
    { id: "afro", name: "Afro / Amapiano", description: "非洲鼓点", trackIds: byText(["afro", "amapiano", "savanna"]) },
    { id: "nu-disco", name: "Nu-Disco / K-pop", description: "明亮合成器", trackIds: byText(["nu-disco", "k-pop", "seoul"]) },
    { id: "techno", name: "Techno / Trance", description: "高速夜航", trackIds: byText(["techno", "trance", "orbit"]) }
  ];
  return candidates.filter((playlist, index) => index < 2 || playlist.trackIds.length > 0);
};

const cleanFacetName = (value: string, fallback: string) => value.trim().replace(/\s+/g, " ") || fallback;

const isSourceMetadata = (value: string) => {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  return !normalized
    || /^suno(?:\s+suno)?(?:\s+v?\d+(?:\.\d+)*)?$/.test(normalized)
    || /^v?\d+(?:\.\d+)*$/.test(normalized)
    || /^(original|test|draft|demo|cover|generated cover)$/.test(normalized);
};

const buildDiscoveryFacets = (tracks: Track[]) => {
  const labels = new Map<string, string>();
  const addToMap = (map: Map<string, Set<string>>, label: string, trackId: string) => {
    const name = cleanFacetName(label, "");
    if (!name) return;
    const key = name.toLowerCase();
    if (!labels.has(key)) labels.set(key, name);
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)?.add(trackId);
  };
  const categories = new Map<string, Set<string>>();
  const styles = new Map<string, Set<string>>();
  tracks.forEach((track) => {
    addToMap(categories, track.album || "Qiaomu Radio", track.id);
    [track.source, track.album]
      .join(" · ")
      .split(/[\/,，|·;；]+/g)
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((style) => !isSourceMetadata(style))
      .forEach((style) => addToMap(styles, style, track.id));
  });
  const toFacet = (map: Map<string, Set<string>>, description: string): DiscoveryFacet[] => Array.from(map.entries())
    .map(([id, ids]) => ({
      id,
      name: labels.get(id) || id,
      description,
      trackIds: Array.from(ids)
    }))
    .sort((a, b) => b.trackIds.length - a.trackIds.length || a.name.localeCompare(b.name));
  return {
    categories: toFacet(categories, "专辑分类"),
    styles: toFacet(styles, "音乐风格")
  };
};

export default function App() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const frequencyDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const timeDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const energyRef = useRef(0);
  const lastVolumeRef = useRef(82);
  const [view, setView] = useState<View>("home");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [adminTracks, setAdminTracks] = useState<Track[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [shuffle, setShuffle] = useState(true);
  const [repeat, setRepeat] = useState(false);
  const [volume, setVolume] = useState(82);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [query, setQuery] = useState("");
  const [admin, setAdmin] = useState(false);
  const [status, setStatus] = useState("");
  const [radioNotice, setRadioNotice] = useState("");
  const [level, setLevel] = useState<number[]>(Array.from({ length: 36 }, () => 0));
  const [activePlaylistId, setActivePlaylistId] = useState("all");
  const [settings, setSettings] = useState<PlayerSettings>(() => readSettings());
  const [playCounts, setPlayCounts] = useState<Record<string, number>>(() => readPlayCounts());

  const activeTrack = tracks[activeIndex];
  const playlists = useMemo(() => buildPlaylists(tracks), [tracks]);
  const discovery = useMemo(() => buildDiscoveryFacets(tracks), [tracks]);
  const activePlaylist = playlists.find((playlist) => playlist.id === activePlaylistId) || playlists[0];
  const playlistTracks = useMemo(() => {
    if (!activePlaylist) return tracks;
    const ids = new Set(activePlaylist.trackIds);
    return tracks.filter((track) => ids.has(track.id));
  }, [activePlaylist, tracks]);
  const waveform = useMemo(() => makeWave(activeTrack?.id || "qiaomu"), [activeTrack?.id]);
  const filteredTracks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return playlistTracks;
    return playlistTracks.filter((track) => [track.title, track.artist, track.source, track.album].join(" ").toLowerCase().includes(q));
  }, [playlistTracks, query]);

  useEffect(() => {
    void loadTracks();
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume / 100;
  }, [volume]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const audio = audioRef.current;
      if (audio) {
        setTime(audio.currentTime || 0);
        setDuration(audio.duration || 0);
        const analyser = analyserRef.current;
        const data = frequencyDataRef.current;
        if (!audio.paused && analyser && data) {
          analyser.getByteFrequencyData(data);
          const bucketCount = 32;
          const usefulBins = Math.floor(data.length * 0.72);
          const bucketSize = Math.max(1, Math.floor(usefulBins / bucketCount));
          const timeData = timeDataRef.current;
          let rms = 0;
          if (timeData) {
            analyser.getByteTimeDomainData(timeData);
            for (let index = 0; index < timeData.length; index += 1) {
              const centered = (timeData[index] - 128) / 128;
              rms += centered * centered;
            }
            rms = Math.sqrt(rms / timeData.length);
          }
          const next = Array.from({ length: bucketCount }, (_, index) => {
            const start = index * bucketSize;
            const end = Math.min(usefulBins, start + bucketSize);
            let sum = 0;
            for (let cursor = start; cursor < end; cursor += 1) sum += data[cursor];
            const raw = sum / Math.max(1, end - start) / 255;
            const lowEndLift = index < 8 ? 1.68 : index < 18 ? 1.28 : 1.04;
            return clamp(Math.pow(raw * lowEndLift, 0.5), 0, 1);
          });
          const energy = next.reduce((sum, value, index) => sum + value * (index < 8 ? 1.35 : 1), 0) / bucketCount;
          const transient = clamp((energy - energyRef.current) * 6.8 + rms * 1.45, 0, 1);
          energyRef.current = energyRef.current * 0.54 + energy * 0.46;
          setLevel((current) => next.map((value, index) => {
            const currentValue = current[index] ?? 0;
            const center = 1 - Math.abs(index - (bucketCount - 1) / 2) / ((bucketCount - 1) / 2);
            const boosted = clamp(value * (1.08 + transient * 0.92 + center * 0.18), 0, 1);
            return boosted > currentValue
              ? currentValue * 0.04 + boosted * 0.96
              : currentValue * 0.42 + boosted * 0.58;
          }));
        } else {
          setLevel((current) => current.map((value) => value * 0.58));
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!radioNotice) return;
    const timer = window.setTimeout(() => setRadioNotice(""), 2200);
    return () => window.clearTimeout(timer);
  }, [radioNotice]);

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    window.localStorage.setItem(PLAY_COUNTS_KEY, JSON.stringify(playCounts));
  }, [playCounts]);

  async function loadTracks(autoplay = false) {
    const response = await fetch("/api/tracks", { cache: "no-store" });
    const data = await response.json();
    const next = data.tracks || [];
    setTracks(next);
    if (next.length) {
      setActiveIndex(0);
      if (autoplay) setTimeout(() => void playTrack(0), 150);
    }
  }

  async function loadAdminTracks() {
    const response = await fetch("/api/admin/tracks", { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      setAdminTracks(data.tracks || []);
    }
  }

  async function checkLogin() {
    const response = await fetch("/api/me", { cache: "no-store" });
    const data = await response.json();
    setAdmin(Boolean(data.admin));
    if (data.admin) await loadAdminTracks();
  }

  async function playTrack(index = activeIndex) {
    const audio = audioRef.current;
    const track = tracks[index];
    if (!audio || !track) return;
    setActiveIndex(index);
    setPlayCounts((current) => ({ ...current, [track.id]: (current[track.id] || 0) + 1 }));
    if (audio.src !== new URL(track.url, window.location.origin).href) {
      audio.src = track.url;
      audio.load();
    }
    try {
      await ensureAudioAnalyser(audio);
      await audio.play();
      setIsPlaying(true);
    } catch {
      setStatus("浏览器拦截了自动播放，点一下播放键即可开始电台。");
    }
  }

  async function ensureAudioAnalyser(audio: HTMLAudioElement) {
    if (!audioContextRef.current) {
      const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioContextRef.current = new AudioContextCtor();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      analyserRef.current.smoothingTimeConstant = 0.18;
      frequencyDataRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
      timeDataRef.current = new Uint8Array(analyserRef.current.fftSize);
    }
    const context = audioContextRef.current;
    const analyser = analyserRef.current;
    if (!context || !analyser) return;
    if (!sourceRef.current) {
      sourceRef.current = context.createMediaElementSource(audio);
      sourceRef.current.connect(analyser);
      analyser.connect(context.destination);
    }
    if (context.state === "suspended") await context.resume();
  }

  function pause() {
    audioRef.current?.pause();
    setIsPlaying(false);
  }

  function toggleMute() {
    if (volume > 0) {
      lastVolumeRef.current = volume;
      setVolume(0);
      return;
    }
    setVolume(lastVolumeRef.current || 82);
  }

  function nextTrack() {
    if (!tracks.length) return;
    const order = playlistTracks.length ? playlistTracks : tracks;
    if (order.length <= 1) {
      setRadioNotice(`${activePlaylist?.name || "当前清单"}只有 1 首歌，已经在播放这一首。`);
      return;
    }
    const current = order.findIndex((track) => track.id === activeTrack?.id);
    const next = shuffle ? Math.floor(Math.random() * order.length) : current + 1;
    const nextTrackId = order[(next + order.length) % order.length]?.id;
    const nextIndex = tracks.findIndex((track) => track.id === nextTrackId);
    if (nextIndex >= 0) void playTrack(nextIndex);
  }

  function prevTrack() {
    if (!tracks.length) return;
    const order = playlistTracks.length ? playlistTracks : tracks;
    if (order.length <= 1) {
      setRadioNotice(`${activePlaylist?.name || "当前清单"}只有 1 首歌，已经在播放这一首。`);
      return;
    }
    const current = order.findIndex((track) => track.id === activeTrack?.id);
    const prevTrackId = order[(current - 1 + order.length) % order.length]?.id;
    const prevIndex = tracks.findIndex((track) => track.id === prevTrackId);
    if (prevIndex >= 0) void playTrack(prevIndex);
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: form.get("password") })
    });
    setStatus(response.ok ? "后台已解锁。" : "密码不对。");
    await checkLogin();
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    setAdmin(false);
    setAdminTracks([]);
  }

  async function uploadTrack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("published", form.get("published") ? "true" : "false");
    setStatus("上传中，稍等一下。");
    const response = await fetch("/api/admin/tracks", { method: "POST", body: form });
    setStatus(response.ok ? "上传完成，已进入电台库。" : "上传失败。");
    if (response.ok) event.currentTarget.reset();
    await loadAdminTracks();
    await loadTracks();
  }

  async function patchTrack(track: Track, form: HTMLFormElement) {
    const data = new FormData(form);
    const nextPublished = Boolean(data.get("published"));
    const response = await fetch(`/api/admin/tracks/${track.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: data.get("title"),
        artist: data.get("artist"),
        source: data.get("source"),
        album: data.get("album"),
        lyrics: data.get("lyrics"),
        published: nextPublished
      })
    });
    if (response.ok) {
      setStatus(track.published !== nextPublished
        ? nextPublished ? `《${track.title}》已发布。` : `《${track.title}》已取消发布，电台前台不会再显示。`
        : `《${track.title}》已保存。`);
    } else {
      setStatus("保存失败。");
    }
    await loadAdminTracks();
    await loadTracks();
    return response.ok;
  }

  async function toggleTrackPublish(track: Track) {
    const nextPublished = !track.published;
    const response = await fetch(`/api/admin/tracks/${track.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ published: nextPublished })
    });
    if (response.ok) {
      setStatus(nextPublished ? `《${track.title}》已发布。` : `《${track.title}》已取消发布，电台前台不会再显示。`);
    } else {
      setStatus(nextPublished ? "发布失败。" : "取消发布失败。");
    }
    await loadAdminTracks();
    await loadTracks();
    return response.ok;
  }

  async function deleteTrack(track: Track) {
    if (!window.confirm(`删除《${track.title}》？`)) return;
    const response = await fetch(`/api/admin/tracks/${track.id}`, { method: "DELETE" });
    setStatus(response.ok ? "已删除。" : "删除失败。");
    await loadAdminTracks();
    await loadTracks();
  }

  const progress = duration ? (time / duration) * 100 : 0;
  const theme = THEMES[settings.theme];
  const updateSettings = (next: Partial<PlayerSettings>) => setSettings((current) => ({ ...current, ...next }));
  const pickPlaylist = (playlist: Playlist) => {
    setView("home");
    setActivePlaylistId(playlist.id);
    const firstIndex = tracks.findIndex((track) => track.id === playlist.trackIds[0]);
    if (firstIndex >= 0 && (!activeTrack || !playlist.trackIds.includes(activeTrack.id))) setActiveIndex(firstIndex);
  };
  const pickFacet = (facet: DiscoveryFacet) => {
    setActivePlaylistId("all");
    setQuery(facet.name);
    const firstIndex = tracks.findIndex((track) => track.id === facet.trackIds[0]);
    if (firstIndex >= 0) setActiveIndex(firstIndex);
    setView("home");
  };
  const handlePlayerSwipeStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    swipeStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const handlePlayerSwipeEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current;
    const touch = event.changedTouches[0];
    swipeStartRef.current = null;
    if (!start || !touch) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 70 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
    if (deltaX < 0) nextTrack();
    else prevTrack();
  };

  return (
    <div className="min-h-[100dvh] bg-[#0f0f0f] text-foreground" style={settingsStyle(settings)}>
      <audio
        ref={audioRef}
        preload="auto"
        playsInline
        onEnded={() => (repeat ? void playTrack(activeIndex) : nextTrack())}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      <div className="app-shell grid h-screen grid-cols-[76px_minmax(0,1fr)] gap-3 p-3 max-lg:grid-cols-1">
        <SideRail
          view={view}
          onHomeClick={() => {
            setView("home");
            setActivePlaylistId("all");
          }}
          onDiscoverClick={() => setView("discover")}
          onSettingsClick={() => setView("settings")}
        />

        {view === "home" ? (
          <main className="radio-layout grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(360px,42vw)] gap-3 max-xl:grid-cols-1">
            <section className="radio-primary grid min-h-0 grid-rows-[minmax(340px,auto)_auto] gap-3">
              <div
                className="player-stage grid min-h-0 grid-cols-[minmax(260px,390px)_minmax(0,1fr)] gap-3 max-lg:grid-cols-1"
                onTouchStart={handlePlayerSwipeStart}
                onTouchEnd={handlePlayerSwipeEnd}
              >
                <NowPlayingCard
                  track={activeTrack}
                  isPlaying={isPlaying}
                  level={level}
                  settings={settings}
                  onToggle={() => isPlaying ? pause() : void playTrack()}
                />

                <CompactLyrics
                  track={activeTrack}
                  time={time}
                  duration={duration}
                  onSeek={(nextTime) => {
                    if (audioRef.current && duration) audioRef.current.currentTime = nextTime;
                  }}
                />

                <Card className="player-card relative overflow-hidden border border-white/10 bg-card/90 shadow-2xl">
                  <Card.Body className="flex h-full flex-col justify-between gap-5 p-6 max-sm:p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                        <Light on={isPlaying} color={theme.primary} size={12} />
                        <span>{isPlaying ? "ON AIR" : "READY"}</span>
                      </div>
                      <h1 className="player-title text-4xl font-black leading-tight tracking-normal text-foreground max-md:text-4xl">
                        {activeTrack?.title || "Qiaomu Music"}
                      </h1>
                      <p className="mt-3 truncate text-base text-muted-foreground">
                        {activeTrack ? `${activeTrack.artist} · ${activeTrack.source}` : "选择一首歌，或者让电台自动开始。"}
                      </p>
                      <p className="mt-2 text-sm text-primary/80">
                        {activePlaylist ? `${activePlaylist.name} · ${playlistTracks.length} 首` : "播放清单"}
                      </p>
                    </div>
                    <div className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-bold text-primary">
                      {playlistTracks.length} tracks
                    </div>
                  </div>

                  <div className="player-waveform-block grid gap-4">
                    <Waveform
                      data={waveform}
                      audioDuration={duration || 180}
                      percentage={progress}
                      waveColor="rgba(255,255,255,0.24)"
                      maskColor={theme.primary}
                      cursorColor="#ffffff"
                      waveHeight={86}
                      onClick={(event) => {
                        if (audioRef.current && duration) {
                          audioRef.current.currentTime = event.time;
                        }
                      }}
                    />
                    <div className="grid grid-cols-[52px_minmax(0,1fr)_52px] items-center gap-3 text-xs text-muted-foreground">
                      <span>{formatTime(time)}</span>
                      <input
                        className="progress-slider"
                        aria-label="播放进度"
                        type="range"
                        min="0"
                        max="1000"
                        value={duration ? Math.round(progress * 10) : 0}
                        disabled={!duration}
                        onChange={(event) => {
                          if (audioRef.current && duration) audioRef.current.currentTime = (Number(event.target.value) / 1000) * duration;
                        }}
                        onInput={(event) => {
                          if (audioRef.current && duration) audioRef.current.currentTime = (Number(event.currentTarget.value) / 1000) * duration;
                        }}
                      />
                      <span className="text-right">{formatTime(duration)}</span>
                    </div>
                  </div>

                  <div className="player-controls">
                    <button className={`control-chip ${shuffle ? "is-active" : ""}`} type="button" onClick={() => setShuffle(!shuffle)} title="随机播放"><Shuffle size={17} /></button>
                    <button className="control-chip" type="button" onClick={prevTrack} title="上一首"><SkipBack size={19} /></button>
                    <button className="control-main" type="button" onClick={() => isPlaying ? pause() : void playTrack()} title={isPlaying ? "暂停" : "播放"}>
                      {isPlaying ? <Pause size={28} /> : <Play size={28} />}
                    </button>
                    <button className="control-chip" type="button" onClick={nextTrack} title="下一首"><SkipForward size={19} /></button>
                    <button className={`control-chip ${repeat ? "is-active" : ""}`} type="button" onClick={() => setRepeat(!repeat)} title="循环播放"><Repeat2 size={17} /></button>

                    <div className="volume-strip">
                      <button className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition hover:bg-white/10 hover:text-foreground" type="button" onClick={toggleMute} title={volume > 0 ? "静音" : "恢复音量"}>
                        {volume > 0 ? <Volume2 size={17} /> : <VolumeX size={17} />}
                      </button>
                      <input aria-label="音量" type="range" min="0" max="100" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
                      <span>{volume}%</span>
                    </div>
                  </div>
                  {radioNotice ? <p className="radio-notice">{radioNotice}</p> : null}
                  {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
                  </Card.Body>
                </Card>
              </div>

              <QueuePanel
                tracks={filteredTracks}
                activeId={activeTrack?.id}
                query={query}
                setQuery={setQuery}
                onPick={(track) => void playTrack(tracks.findIndex((item) => item.id === track.id))}
              />
            </section>
            <LyricsPanel
              track={activeTrack}
              time={time}
              duration={duration}
              onSeek={(nextTime) => {
                if (audioRef.current && duration) audioRef.current.currentTime = nextTime;
              }}
            />
          </main>
        ) : view === "discover" ? (
          <DiscoverPanel
            tracks={tracks}
            categories={discovery.categories}
            styles={discovery.styles}
            playCounts={playCounts}
            activeTrackId={activeTrack?.id}
            isPlaying={isPlaying}
            time={time}
            duration={duration}
            onToggleTrack={(track) => {
              if (activeTrack?.id === track.id && isPlaying) pause();
              else void playTrack(tracks.findIndex((item) => item.id === track.id));
            }}
            onPickTrack={(track) => {
              setView("home");
              void playTrack(tracks.findIndex((item) => item.id === track.id));
            }}
            onPickFacet={pickFacet}
          />
        ) : view === "settings" ? (
          <SettingsPanel
            settings={settings}
            updateSettings={updateSettings}
            onOpenAdmin={() => {
              setView("admin");
              void checkLogin();
            }}
            onBack={() => setView("home")}
          />
        ) : (
          <AdminPanel
            admin={admin}
            tracks={adminTracks}
            status={status}
            onLogin={login}
            onLogout={logout}
            onUpload={uploadTrack}
            onPatch={patchTrack}
            onTogglePublish={toggleTrackPublish}
            onDelete={deleteTrack}
          />
        )}
      </div>
      <GlobalPlayerBar
        track={activeTrack}
        isPlaying={isPlaying}
        time={time}
        duration={duration}
        progress={progress}
        shuffle={shuffle}
        repeat={repeat}
        volume={volume}
        onOpen={() => setView("home")}
        onToggle={() => isPlaying ? pause() : void playTrack()}
        onPrev={prevTrack}
        onNext={nextTrack}
        onToggleShuffle={() => setShuffle(!shuffle)}
        onToggleRepeat={() => setRepeat(!repeat)}
        onSeek={(nextTime) => {
          if (audioRef.current && duration) audioRef.current.currentTime = nextTime;
        }}
        onToggleMute={toggleMute}
        onVolumeChange={setVolume}
      />
    </div>
  );
}

function GlobalPlayerBar({
  track,
  isPlaying,
  time,
  duration,
  progress,
  shuffle,
  repeat,
  volume,
  onOpen,
  onToggle,
  onPrev,
  onNext,
  onToggleShuffle,
  onToggleRepeat,
  onSeek,
  onToggleMute,
  onVolumeChange
}: {
  track?: Track;
  isPlaying: boolean;
  time: number;
  duration: number;
  progress: number;
  shuffle: boolean;
  repeat: boolean;
  volume: number;
  onOpen: () => void;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
  onSeek: (time: number) => void;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
}) {
  return (
    <footer className="global-player-bar" aria-label="全局播放控制">
      <button type="button" className="global-player-track" onClick={onOpen} title="打开当前播放">
        <span className="global-player-cover">{track?.coverUrl ? <img src={track.coverUrl} alt="" /> : <Music2 size={22} />}</span>
        <span className="global-player-meta">
          <strong>{track?.title || "Qiaomu Music"}</strong>
          <small>{track ? track.artist : "选择一首歌开始播放"}</small>
        </span>
      </button>

      <div className="global-player-center">
        <div className="global-player-controls">
          <button type="button" className={`global-player-icon global-player-mode ${shuffle ? "is-active" : ""}`} onClick={onToggleShuffle} title={shuffle ? "随机播放" : "顺序播放"}><Shuffle size={16} /></button>
          <button type="button" className="global-player-icon" onClick={onPrev} title="上一首"><SkipBack size={18} /></button>
          <button type="button" className="global-player-main" onClick={onToggle} title={isPlaying ? "暂停" : "播放"}>
            {isPlaying ? <Pause size={24} /> : <Play size={24} />}
          </button>
          <button type="button" className="global-player-icon" onClick={onNext} title="下一首"><SkipForward size={18} /></button>
          <button type="button" className={`global-player-icon global-player-mode ${repeat ? "is-active" : ""}`} onClick={onToggleRepeat} title="单曲循环"><Repeat2 size={16} /></button>
        </div>
        <div className="global-player-progress-row">
          <span>{formatTime(time)}</span>
          <input
            className="global-player-progress"
            aria-label="全局播放进度"
            type="range"
            min="0"
            max="1000"
            value={duration ? Math.round(progress * 10) : 0}
            disabled={!duration}
            onChange={(event) => onSeek((Number(event.target.value) / 1000) * duration)}
            onInput={(event) => onSeek((Number(event.currentTarget.value) / 1000) * duration)}
          />
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="global-player-volume">
        <button type="button" className="global-player-icon" onClick={onToggleMute} title={volume > 0 ? "静音" : "恢复音量"}>
          {volume > 0 ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
        <input aria-label="全局音量" type="range" min="0" max="100" value={volume} onChange={(event) => onVolumeChange(Number(event.target.value))} />
      </div>
    </footer>
  );
}

function SideRail({
  view,
  onHomeClick,
  onDiscoverClick,
  onSettingsClick
}: {
  view: View;
  onHomeClick: () => void;
  onDiscoverClick: () => void;
  onSettingsClick: () => void;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <aside className="side-rail relative flex flex-col items-center gap-4 rounded-lg border border-white/10 bg-card/90 p-3 shadow-2xl max-lg:flex-row max-lg:justify-between">
      <div className="side-logo grid place-items-center gap-2 text-center">
        <button
          type="button"
          onClick={() => {
            onHomeClick();
            closeMobileMenu();
          }}
          className="grid h-12 w-12 place-items-center rounded-full bg-primary text-xl font-black text-black transition hover:scale-105"
          title="回到播放器"
        >
          Q
        </button>
        <span className="text-[11px] font-bold text-muted-foreground max-lg:hidden">MUSIC</span>
      </div>
      <div className="mobile-brand-title" aria-label="乔木音乐">乔木音乐</div>
      <div className={`side-actions flex flex-1 flex-col gap-3 max-lg:flex-row ${mobileMenuOpen ? "is-open" : ""}`}>
        <button
          type="button"
          className={`settings-trigger ${view === "home" ? "is-active" : ""}`}
          title="播放器首页"
          onClick={() => {
            onHomeClick();
            closeMobileMenu();
          }}
        >
          <Home size={19} />
          <span className="mobile-menu-text">首页</span>
        </button>
        <button
          type="button"
          className={`settings-trigger ${view === "discover" ? "is-active" : ""}`}
          title="发现音乐"
          onClick={() => {
            onDiscoverClick();
            closeMobileMenu();
          }}
        >
          <Compass size={19} />
          <span className="mobile-menu-text">发现</span>
        </button>
        <button
          type="button"
          className={`settings-trigger side-settings ${view === "settings" ? "is-active" : ""}`}
          title="设置"
          onClick={() => {
            onSettingsClick();
            closeMobileMenu();
          }}
        >
          <Settings size={19} />
          <span className="mobile-menu-text">设置</span>
        </button>
      </div>
      <button
        type="button"
        className={`mobile-menu-trigger ${mobileMenuOpen ? "is-open" : ""}`}
        onClick={() => setMobileMenuOpen((open) => !open)}
        title={mobileMenuOpen ? "关闭菜单" : "打开菜单"}
        aria-expanded={mobileMenuOpen}
      >
        {mobileMenuOpen ? <X size={21} /> : <Menu size={21} />}
      </button>
    </aside>
  );
}

function NowPlayingCard({ track, isPlaying, level, settings, onToggle }: {
  track?: Track;
  isPlaying: boolean;
  level: number[];
  settings: PlayerSettings;
  onToggle: () => void;
}) {
  return (
    <Card toggled={isPlaying} className="overflow-hidden border border-white/10 bg-card/90 shadow-2xl">
      <Card.Body className="relative flex h-full flex-col justify-between p-5">
        <div
          className={`cover-aura ${isPlaying ? "is-playing" : ""}`}
          style={{
            "--cover-energy": `${Math.max(...level)}`,
            background: track?.coverUrl ? `url(${track.coverUrl}) center/cover` : "linear-gradient(135deg,#ffbe3b,#5ac8fa,#ff4d7d)"
          } as CSSProperties}
        />
        <button
          type="button"
          onClick={onToggle}
          className={`cover-button group relative aspect-square overflow-hidden rounded-md border border-white/10 bg-muted text-left outline-none transition hover:border-primary/50 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 ${isPlaying ? "is-playing" : ""}`}
          title={isPlaying ? "点击封面暂停" : "点击封面播放"}
        >
          {track?.coverUrl ? <img src={track.coverUrl} alt="" className="h-full w-full object-cover" /> : (
            <div className="grid h-full place-items-center text-7xl font-black text-primary">QM</div>
          )}
          {settings.visualizerEnabled ? (
            <div
              className={`cover-sonic-ring is-${settings.visualizerStyle} is-${settings.visualizerPosition} ${isPlaying ? "is-playing" : ""}`}
              aria-hidden="true"
              style={{ "--cover-energy": `${Math.max(...level)}` } as CSSProperties}
            >
              {level.map((value, index) => (
                <span
                  key={index}
                  style={{
                    "--angle": `${(index / Math.max(1, level.length)) * 360}deg`,
                    "--index": index,
                    "--x": `${5 + index * 2.82}%`,
                    "--value": value,
                    height: `${18 + value * 82}px`,
                    opacity: 0.28 + value * 0.72
                  } as CSSProperties}
                />
              ))}
            </div>
          ) : null}
          <div className="cover-glass" aria-hidden="true" />
          <div className="cover-play-layer">
            <span>
              {isPlaying ? <Pause size={30} /> : <Play size={30} />}
            </span>
          </div>
        </button>
        <div className="relative mt-5">
          <p className="text-sm text-muted-foreground">{track?.album || "全部已发布歌曲"}</p>
          <h2 className="mt-2 text-2xl font-black tracking-normal">{track?.title || "Qiaomu Music"}</h2>
        </div>
      </Card.Body>
    </Card>
  );
}

function CompactLyrics({ track, time, duration, onSeek }: { track?: Track; time: number; duration: number; onSeek: (time: number) => void }) {
  const lines = useMemo(() => parseLyrics(track?.lyrics), [track?.lyrics]);
  const activeLine = useMemo(() => getActiveLyricIndex(lines, time, duration), [duration, lines, time]);
  const visibleLines = useMemo(() => {
    if (!lines.length) return [];
    const start = clamp(activeLine - 1, 0, Math.max(0, lines.length - 3));
    return lines.slice(start, start + 3).map((line, index) => ({ line, index: start + index }));
  }, [activeLine, lines]);

  return (
    <Card className="compact-lyrics-card border border-white/10 bg-card/90">
      <Card.Body className="p-4">
        <div className="compact-lyrics-window" aria-label="当前歌词">
          {visibleLines.length ? visibleLines.map(({ line, index }) => (
            <button
              key={line.id}
              type="button"
              className={`compact-lyric-line ${index === activeLine ? "is-active" : ""}`}
              onClick={() => {
                const target = typeof line.time === "number"
                  ? line.time
                  : duration
                    ? (index / Math.max(1, lines.length - 1)) * duration
                    : 0;
                if (target) onSeek(target);
              }}
            >
              {line.text}
            </button>
          )) : (
            <p className="compact-lyric-empty">歌词会在这里以三行随播显示。</p>
          )}
        </div>
      </Card.Body>
    </Card>
  );
}

function LyricsPanel({ track, time, duration, onSeek }: { track?: Track; time: number; duration: number; onSeek: (time: number) => void }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const lines = useMemo(() => parseLyrics(track?.lyrics), [track?.lyrics]);
  const activeLine = useMemo(() => getActiveLyricIndex(lines, time, duration), [duration, lines, time]);

  useEffect(() => {
    const container = scrollRef.current;
    const element = lineRefs.current[activeLine];
    if (container && element) {
      const target = element.offsetTop - container.clientHeight / 2 + element.clientHeight / 2;
      container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    }
  }, [activeLine, track?.id]);

  return (
    <Card className="lyrics-card min-h-0 border border-white/10 bg-card/90">
      <Card.Header className="flex items-center justify-between p-5">
        <h2 className="text-xl font-black tracking-normal">Lyrics</h2>
      </Card.Header>
      <Card.Body className="min-h-0 overflow-hidden px-5 pb-5">
        <div ref={scrollRef} className="lyrics-scroll h-full overflow-auto rounded-md border border-white/10 bg-black/20 p-5">
          {lines.length ? lines.map((line, index) => (
            <button
              key={line.id}
              ref={(element) => {
                lineRefs.current[index] = element;
              }}
              type="button"
              onClick={() => {
                const target = typeof line.time === "number"
                  ? line.time
                  : duration
                    ? (index / Math.max(1, lines.length - 1)) * duration
                    : 0;
                if (target) onSeek(target);
              }}
              className={`lyrics-line ${index === activeLine ? "is-active" : ""} ${line.text.startsWith("[") ? "is-section" : ""}`}
            >
              {line.text}
            </button>
          )) : (
            <p className="text-[15px] leading-8 text-muted-foreground">歌曲歌词会在这里随着当前曲目出现。</p>
          )}
        </div>
      </Card.Body>
    </Card>
  );
}

function QueuePanel({ tracks, activeId, query, setQuery, onPick }: {
  tracks: Track[];
  activeId?: string;
  query: string;
  setQuery: (value: string) => void;
  onPick: (track: Track) => void;
}) {
  return (
    <Card className="queue-card min-h-0 border border-white/10 bg-card/90">
      <Card.Header className="grid gap-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-black tracking-normal"><ListMusic size={19} /> Queue</h2>
          <span className="text-sm text-primary">{tracks.length}</span>
        </div>
        <label className="flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3">
          <Search size={16} className="text-muted-foreground" />
          <input className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索歌曲/风格" />
        </label>
      </Card.Header>
      <Card.Body className="queue-list grid min-h-0 gap-2 px-4 pb-5">
        {tracks.map((track) => (
          <button key={track.id} onClick={() => onPick(track)} className={`grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 rounded-md p-2 text-left transition hover:bg-white/10 ${track.id === activeId ? "bg-primary/15" : ""}`}>
            <span className="h-[52px] w-[52px] overflow-hidden rounded bg-muted">
              {track.coverUrl ? <img src={track.coverUrl} alt="" className="h-full w-full object-cover" /> : null}
            </span>
            <span className="min-w-0">
              <strong className="block truncate text-sm">{track.title}</strong>
              <small className="block truncate text-muted-foreground">{track.source}</small>
            </span>
            <Light on={track.id === activeId} color="#ffbe3b" size={10} />
          </button>
        ))}
      </Card.Body>
    </Card>
  );
}

function DiscoverPanel({ tracks, categories, styles, playCounts, activeTrackId, isPlaying, time, duration, onToggleTrack, onPickTrack, onPickFacet }: {
  tracks: Track[];
  categories: DiscoveryFacet[];
  styles: DiscoveryFacet[];
  playCounts: Record<string, number>;
  activeTrackId?: string;
  isPlaying: boolean;
  time: number;
  duration: number;
  onToggleTrack: (track: Track) => void;
  onPickTrack: (track: Track) => void;
  onPickFacet: (facet: DiscoveryFacet) => void;
}) {
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [activeStyleId, setActiveStyleId] = useState("all");
  const [recentStyleId, setRecentStyleId] = useState("all");
  const q = discoverQuery.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!q) return [];
    return tracks
      .filter((track) => [track.title, track.artist, track.source, track.album, track.lyrics].join(" ").toLowerCase().includes(q))
      .slice(0, 10);
  }, [q, tracks]);
  const selectedStyle = activeStyleId === "all" ? null : styles.find((style) => style.id === activeStyleId) || null;
  const styleTracks = selectedStyle
    ? tracks.filter((track) => selectedStyle.trackIds.includes(track.id)).slice(0, 10)
    : tracks.slice(0, 10);
  const recentTracks = useMemo(() => tracks
    .map((track) => ({ track, count: playCounts[track.id] || 0 }))
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count || new Date(b.track.createdAt).getTime() - new Date(a.track.createdAt).getTime())
    .slice(0, 8), [playCounts, tracks]);
  const recentStyle = recentStyleId === "all" ? null : styles.find((style) => style.id === recentStyleId) || null;
  const filteredRecentTracks = useMemo(() => {
    if (!recentStyle) return recentTracks;
    const ids = new Set(recentStyle.trackIds);
    return recentTracks.filter(({ track }) => ids.has(track.id));
  }, [recentStyle, recentTracks]);
  const coverFlowTracks = useMemo(() => tracks.filter((track) => track.coverUrl), [tracks]);
  const [coverFlowIndex, setCoverFlowIndex] = useState(0);
  const [compactCoverFlow, setCompactCoverFlow] = useState(false);
  const coverFlowLengthRef = useRef(0);
  const coverFlowRef = useRef<any>(null);
  const heroTrack = coverFlowTracks[coverFlowIndex] || coverFlowTracks[0] || tracks[0];
  const coverFlowSideCount = compactCoverFlow ? 1 : 2;
  const coverFlowHitTargets = useMemo(() => {
    const targets: Array<{ track: Track; index: number; offset: number }> = [];
    for (let offset = -coverFlowSideCount; offset <= coverFlowSideCount; offset += 1) {
      const index = coverFlowIndex + offset;
      const track = coverFlowTracks[index];
      if (!track) continue;
      targets.push({ track, index, offset });
    }
    return targets;
  }, [coverFlowIndex, coverFlowSideCount, coverFlowTracks]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 700px)");
    const syncCompact = () => setCompactCoverFlow(media.matches);
    syncCompact();
    media.addEventListener("change", syncCompact);
    return () => media.removeEventListener("change", syncCompact);
  }, []);

  useEffect(() => {
    if (coverFlowLengthRef.current === coverFlowTracks.length) return;
    coverFlowLengthRef.current = coverFlowTracks.length;
    setCoverFlowIndex(coverFlowTracks.length ? Math.floor(coverFlowTracks.length / 2) : 0);
  }, [coverFlowTracks.length]);

  useEffect(() => {
    if (coverFlowIndex >= coverFlowTracks.length) setCoverFlowIndex(0);
  }, [coverFlowIndex, coverFlowTracks.length]);

  const syncCoverFlowVisual = (index: number) => {
    coverFlowRef.current?._handleFigureClick?.(index, undefined, { preventDefault: () => undefined });
  };
  const playCoverFlowIndex = (index: number) => {
    const nextTrack = coverFlowTracks[index];
    if (!nextTrack) return;
    syncCoverFlowVisual(index);
    setCoverFlowIndex(index);
    onToggleTrack(nextTrack);
  };
  const shiftCoverFlow = (direction: -1 | 1) => {
    if (!coverFlowTracks.length) return;
    const nextIndex = (coverFlowIndex + direction + coverFlowTracks.length) % coverFlowTracks.length;
    playCoverFlowIndex(nextIndex);
  };
  const selectCoverFlowTrack = (track: Track, index: number) => {
    syncCoverFlowVisual(index);
    setCoverFlowIndex(index);
    onToggleTrack(track);
  };
  const heroIsActive = heroTrack?.id === activeTrackId;
  const heroIsPlaying = Boolean(heroTrack && heroIsActive && isPlaying);
  const heroTime = heroIsActive ? time : 0;
  const heroDuration = heroIsActive ? duration : 0;

  return (
    <main className="discover-page discover-two-column min-h-0 overflow-auto pr-1">
      <section className="discover-left-column">
        <Card className="discover-cover-card border border-white/10 bg-card/90">
          <Card.Header className="discover-cover-header p-5">
            <div>
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Compass size={16} /> Discover</p>
              <h1 className="text-4xl font-black tracking-normal max-sm:text-3xl">发现音乐</h1>
            </div>
          </Card.Header>
          <Card.Body className="px-5 pb-5">
            <div className="discover-cover-flow">
              {coverFlowTracks.length ? (
                <div
                  className="cover-flow-library"
                  aria-label="专辑封面展示"
                >
                  <Coverflow
                    ref={coverFlowRef}
                    width="100%"
                    height="220"
                    displayQuantityOfSide={coverFlowSideCount}
                    navigation={false}
                    enableHeading={false}
                    enableScroll
                    clickable
                    active={coverFlowIndex}
                    currentFigureScale={compactCoverFlow ? 2.05 : 1.34}
                    otherFigureScale={compactCoverFlow ? 0.88 : 0.7}
                  >
                    {coverFlowTracks.map((track, index) => (
                      <div
                        key={track.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => selectCoverFlowTrack(track, index)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          selectCoverFlowTrack(track, index);
                        }}
                        title={index === coverFlowIndex ? `${heroIsPlaying ? "暂停" : "播放"} ${track.title}` : `播放 ${track.title}`}
                      >
                        <img src={track.coverUrl} alt={track.title} />
                      </div>
                    ))}
                  </Coverflow>
                </div>
              ) : (
                <span className="cover-flow-empty"><Music2 size={40} /></span>
              )}
              {coverFlowHitTargets.length ? (
                <div className="cover-flow-hit-targets" aria-hidden="true">
                  {coverFlowHitTargets.map(({ track, index, offset }) => {
                    const positionClass = offset === 0 ? "is-center" : offset < 0 ? `is-left-${Math.abs(offset)}` : `is-right-${offset}`;
                    return (
                      <button
                        key={track.id}
                        type="button"
                        tabIndex={-1}
                        className={`cover-flow-hit-target ${positionClass}`}
                        onClick={() => selectCoverFlowTrack(track, index)}
                        title={index === coverFlowIndex ? `${heroIsPlaying ? "暂停" : "播放"} ${track.title}` : `播放 ${track.title}`}
                      />
                    );
                  })}
                </div>
              ) : null}
              {coverFlowTracks.length > 1 ? (
                <div className="cover-flow-switcher" aria-label="切换封面">
                  <button type="button" onClick={() => shiftCoverFlow(-1)} title="上一张封面"><ChevronLeft size={20} /></button>
                  <button type="button" onClick={() => shiftCoverFlow(1)} title="下一张封面"><ChevronRight size={20} /></button>
                </div>
              ) : null}
              {heroTrack ? (
                <>
                  <button type="button" className="cover-flow-center-toggle" onClick={() => onToggleTrack(heroTrack)} title={heroIsPlaying ? `暂停 ${heroTrack.title}` : `播放 ${heroTrack.title}`}>
                    <span>{heroIsPlaying ? <Pause size={34} /> : <Play size={34} />}</span>
                  </button>
                  <button type="button" className="cover-flow-current" onClick={() => onPickTrack(heroTrack)} title={`打开 ${heroTrack.title} 详情`}>
                    <strong>{heroTrack.title}</strong>
                    <small>{formatTime(heroTime)} / {formatTime(heroDuration)} · {heroTrack.album}</small>
                  </button>
                </>
              ) : null}
            </div>
          </Card.Body>
        </Card>

        <Card className="border border-white/10 bg-card/90">
          <Card.Header className="grid gap-3 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-xl font-black tracking-normal"><Search size={19} /> 搜索</h2>
              <span className="text-sm text-primary">{searchResults.length}</span>
            </div>
            <label className="discover-search">
              <Search size={18} />
              <input value={discoverQuery} onChange={(event) => setDiscoverQuery(event.target.value)} placeholder="搜索歌曲、风格、歌词或专辑" />
            </label>
          </Card.Header>
          {q ? (
            <Card.Body className="search-result-list px-4 pb-5">
              {searchResults.map((track) => (
                <button key={track.id} type="button" className="search-result" onClick={() => onPickTrack(track)}>
                  <span className="discover-cover">{track.coverUrl ? <img src={track.coverUrl} alt="" /> : <Music2 size={18} />}</span>
                  <span className="min-w-0">
                    <strong>{track.title}</strong>
                    <small>{track.album} · {track.source}</small>
                  </span>
                  <Play size={16} />
                </button>
              ))}
              {!searchResults.length ? <EmptyState text="没有找到匹配歌曲。" /> : null}
            </Card.Body>
          ) : null}
        </Card>

        <Card className="border border-white/10 bg-card/90">
          <Card.Header className="grid gap-3 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-black tracking-normal">按风格浏览</h2>
              <span className="text-sm text-primary">{selectedStyle?.trackIds.length || tracks.length} 首</span>
            </div>
            <div className="style-chip-row">
              <button type="button" className={activeStyleId === "all" ? "is-active" : ""} onClick={() => setActiveStyleId("all")}>所有</button>
              {styles.map((style) => (
                <button key={style.id} type="button" className={style.id === activeStyleId ? "is-active" : ""} onClick={() => setActiveStyleId(style.id)}>
                  {style.name}
                </button>
              ))}
            </div>
          </Card.Header>
          <Card.Body className="track-shelf px-5 pb-5">
            {styleTracks.map((track) => (
              <button key={track.id} type="button" className="discover-track" onClick={() => onPickTrack(track)}>
                <span className="discover-cover">{track.coverUrl ? <img src={track.coverUrl} alt="" /> : <Music2 size={20} />}</span>
                <span>
                  <strong>{track.title}</strong>
                  <small>{track.artist} · {track.source}</small>
                </span>
              </button>
            ))}
            {!styleTracks.length ? <EmptyState text="暂无可浏览风格。" /> : null}
          </Card.Body>
        </Card>
      </section>

      <section className="discover-right-column">
        <Card className="border border-white/10 bg-card/90">
          <Card.Header className="grid gap-3 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-xl font-black tracking-normal"><Sparkles size={19} /> 最近播放</h2>
              <span className="text-sm text-muted-foreground">按播放次数</span>
            </div>
            <div className="style-chip-row">
              <button type="button" className={recentStyleId === "all" ? "is-active" : ""} onClick={() => setRecentStyleId("all")}>所有</button>
              {styles.map((style) => (
                <button key={style.id} type="button" className={recentStyleId === style.id ? "is-active" : ""} onClick={() => setRecentStyleId(style.id)}>
                  {style.name}
                </button>
              ))}
            </div>
          </Card.Header>
          <Card.Body className="recent-play-list px-4 pb-5">
            {filteredRecentTracks.map(({ track, count }) => (
              <button key={track.id} type="button" className="search-result recent-play-item" onClick={() => onPickTrack(track)}>
                <span className="discover-cover">{track.coverUrl ? <img src={track.coverUrl} alt="" /> : <Music2 size={18} />}</span>
                <span className="min-w-0">
                  <strong>{track.title}</strong>
                  <small>{track.album} · {track.source}</small>
                </span>
                <em>{count}</em>
              </button>
            ))}
            {!filteredRecentTracks.length ? <EmptyState text="开始播放后，这里会按次数排列常听歌曲。" /> : null}
          </Card.Body>
        </Card>

        <Card className="border border-white/10 bg-card/90">
          <Card.Header className="p-5">
            <h2 className="flex items-center gap-2 text-xl font-black tracking-normal"><Tags size={19} /> 分类</h2>
          </Card.Header>
          <Card.Body className="facet-grid px-5 pb-5">
            {categories.map((category) => (
              <button key={category.id} type="button" onClick={() => onPickFacet(category)} className="facet-card">
                <strong>{category.name}</strong>
                <small>{category.trackIds.length} 首 · {category.description}</small>
              </button>
            ))}
            {!categories.length ? <EmptyState text="暂无可浏览分类。" /> : null}
          </Card.Body>
        </Card>
      </section>
    </main>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function SettingsPanel({ settings, updateSettings, onOpenAdmin, onBack }: {
  settings: PlayerSettings;
  updateSettings: (next: Partial<PlayerSettings>) => void;
  onOpenAdmin: () => void;
  onBack: () => void;
}) {
  const theme = THEMES[settings.theme];

  return (
    <main className="settings-page grid min-h-0 gap-3 overflow-auto pr-1">
      <Card className="border border-white/10 bg-card/90">
        <Card.Body className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Settings size={16} /> Player settings</p>
            <h1 className="text-4xl font-black tracking-normal">播放体验设置</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button radius="full" onClick={onBack}>回到电台</Button>
            <Button radius="full" onClick={onOpenAdmin}><Lock size={16} /> 后台</Button>
          </div>
        </Card.Body>
      </Card>

      <section className="settings-grid">
        <Card className="border border-white/10 bg-card/90">
          <Card.Header className="p-5">
            <h2 className="flex items-center gap-2 text-xl font-black tracking-normal"><Palette size={19} /> 页面配色</h2>
          </Card.Header>
          <Card.Body className="grid gap-3 px-5 pb-5">
            {(Object.entries(THEMES) as Array<[ThemeId, typeof THEMES[ThemeId]]>).map(([id, item]) => (
              <button
                key={id}
                type="button"
                className={`settings-option theme-option ${settings.theme === id ? "is-active" : ""}`}
                onClick={() => updateSettings({ theme: id })}
              >
                <span className="theme-swatch" style={{
                  "--swatch-primary": item.primary,
                  "--swatch-secondary": item.secondary,
                  "--swatch-accent": item.accent
                } as CSSProperties} />
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.primary} / {item.accent}</small>
                </span>
              </button>
            ))}
          </Card.Body>
        </Card>

        <Card className="border border-white/10 bg-card/90">
          <Card.Header className="p-5">
            <h2 className="text-xl font-black tracking-normal">封面声纹</h2>
          </Card.Header>
          <Card.Body className="grid gap-5 px-5 pb-5">
            <button
              type="button"
              className={`settings-switch ${settings.visualizerEnabled ? "is-active" : ""}`}
              onClick={() => updateSettings({ visualizerEnabled: !settings.visualizerEnabled })}
            >
              {settings.visualizerEnabled ? <Eye size={18} /> : <EyeOff size={18} />}
              <span>
                <strong>{settings.visualizerEnabled ? "显示声纹动效" : "隐藏声纹动效"}</strong>
                <small>关闭后保留封面光晕和播放控制。</small>
              </span>
            </button>

            <div className="settings-control-group">
              <div>
                <strong>显示样式</strong>
                <small>选择声纹如何贴合封面。</small>
              </div>
              <div className="segmented-control">
                {([
                  ["ring", "横向波纹"],
                  ["halo", "封面光圈"],
                  ["bars", "底部频谱"]
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={settings.visualizerStyle === value ? "is-active" : ""}
                    onClick={() => updateSettings({ visualizerStyle: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-control-group">
              <div>
                <strong>显示位置</strong>
                <small>控制声纹在封面上的重心。</small>
              </div>
              <div className="segmented-control">
                {([
                  ["center", "居中"],
                  ["edge", "边缘"],
                  ["bottom", "下方"]
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={settings.visualizerPosition === value ? "is-active" : ""}
                    onClick={() => updateSettings({ visualizerPosition: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </Card.Body>
        </Card>

        <Card className="settings-preview border border-white/10 bg-card/90">
          <Card.Body className="grid gap-5 p-5">
            <div>
              <p className="text-sm text-muted-foreground">Live preview</p>
              <h2 className="text-2xl font-black tracking-normal">{theme.name}</h2>
            </div>
            <div className="settings-preview-cover">
              <div className={`settings-preview-visualizer is-${settings.visualizerStyle} is-${settings.visualizerPosition} ${settings.visualizerEnabled ? "is-on" : ""}`}>
                {Array.from({ length: 28 }, (_, index) => (
                  <span
                    key={index}
                    style={{
                     "--angle": `${(index / 28) * 360}deg`,
                     "--index": index,
                      "--delay": `${index * -72}ms`,
                      "--x": `${7 + index * 3.2}%`,
                      "--value": 0.18 + (Math.sin(index * 1.7) + 1) * 0.34
                    } as CSSProperties}
                  />
                ))}
              </div>
            </div>
            <div className="settings-preview-palette">
              <span style={{ background: theme.primary }} />
              <span style={{ background: theme.secondary }} />
              <span style={{ background: theme.accent }} />
            </div>
          </Card.Body>
        </Card>
      </section>
    </main>
  );
}

function AdminPanel({ admin, tracks, status, onLogin, onLogout, onUpload, onPatch, onTogglePublish, onDelete }: {
  admin: boolean;
  tracks: Track[];
  status: string;
  onLogin: (event: FormEvent<HTMLFormElement>) => void;
  onLogout: () => void;
  onUpload: (event: FormEvent<HTMLFormElement>) => void;
  onPatch: (track: Track, form: HTMLFormElement) => Promise<boolean>;
  onTogglePublish: (track: Track) => Promise<boolean>;
  onDelete: (track: Track) => void;
}) {
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const [adminQuery, setAdminQuery] = useState("");
  const [publishFilter, setPublishFilter] = useState<"all" | "published" | "draft">("all");
  const [editingId, setEditingId] = useState<string>("");
  const [showUpload, setShowUpload] = useState(false);
  const [previewId, setPreviewId] = useState("");
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const filtered = useMemo(() => {
    const q = adminQuery.trim().toLowerCase();
    return tracks.filter((track) => {
      const matchText = !q || [track.title, track.artist, track.source, track.album].join(" ").toLowerCase().includes(q);
      const matchState = publishFilter === "all" || (publishFilter === "published" ? track.published : !track.published);
      return matchText && matchState;
    });
  }, [adminQuery, publishFilter, tracks]);
  const publishedCount = tracks.filter((track) => track.published).length;
  const draftCount = tracks.length - publishedCount;
  const previewTrack = tracks.find((track) => track.id === previewId);

  const togglePreview = async (track: Track) => {
    const audio = previewRef.current;
    if (!audio) return;
    if (previewId === track.id && !audio.paused) {
      audio.pause();
      setPreviewPlaying(false);
      return;
    }
    if (audio.src !== new URL(track.url, window.location.origin).href) {
      audio.src = track.url;
      audio.load();
      setPreviewTime(0);
      setPreviewDuration(0);
    }
    setPreviewId(track.id);
    try {
      await audio.play();
      setPreviewPlaying(true);
    } catch {
      setPreviewPlaying(false);
    }
  };

  return (
    <main className="admin-shell grid min-h-0 gap-3 overflow-auto pr-1">
      <audio
        ref={previewRef}
        preload="metadata"
        onTimeUpdate={(event) => setPreviewTime(event.currentTarget.currentTime || 0)}
        onLoadedMetadata={(event) => setPreviewDuration(event.currentTarget.duration || 0)}
        onPlay={() => setPreviewPlaying(true)}
        onPause={() => setPreviewPlaying(false)}
        onEnded={() => setPreviewPlaying(false)}
      />
      <Card className="border border-white/10 bg-card/90">
        <Card.Body className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="text-sm text-muted-foreground">Admin console</p>
            <h1 className="text-4xl font-black tracking-normal">音乐库管理</h1>
          </div>
          {admin ? <Button radius="full" onClick={onLogout}><LogOut size={16} /> 退出</Button> : null}
        </Card.Body>
      </Card>

      {!admin ? (
        <Card className="border border-white/10 bg-card/90">
          <Card.Body className="p-6">
            <form onSubmit={onLogin} className="flex max-w-xl gap-3 max-sm:flex-col">
              <input name="password" type="password" placeholder="后台密码" className="field flex-1" />
              <Button radius="full">登录</Button>
            </form>
            {status ? <p className="mt-4 text-sm text-muted-foreground">{status}</p> : null}
          </Card.Body>
        </Card>
      ) : (
        <>
          <Card className="border border-white/10 bg-card/90">
            <Card.Body className="grid gap-5 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="grid grid-cols-3 gap-2 text-sm max-sm:grid-cols-1">
                  <div className="admin-stat"><span>{tracks.length}</span><small>全部歌曲</small></div>
                  <div className="admin-stat"><span>{publishedCount}</span><small>已发布</small></div>
                  <div className="admin-stat"><span>{draftCount}</span><small>未发布</small></div>
                </div>
                <Button radius="full" onClick={() => setShowUpload(!showUpload)}><Upload size={16} /> 上传歌曲</Button>
              </div>

              {showUpload ? (
                <form onSubmit={onUpload} className="admin-upload grid gap-3">
                  <div className="grid grid-cols-4 gap-3 max-xl:grid-cols-2 max-sm:grid-cols-1">
                    <input className="field" name="title" placeholder="歌曲标题" required />
                    <input className="field" name="artist" placeholder="艺术家" defaultValue="Qiaomu" />
                    <input className="field" name="source" placeholder="来源/风格" defaultValue="Suno" />
                    <input className="field" name="album" placeholder="专辑" defaultValue="Qiaomu Dance Radio" />
                  </div>
                  <textarea className="field min-h-28" name="lyrics" placeholder="LRC 或普通歌词" />
                  <div className="grid grid-cols-[1fr_1fr_160px_120px] items-center gap-3 max-lg:grid-cols-1">
                    <label className="field text-sm text-muted-foreground">音频<input name="audio" type="file" accept="audio/*" required className="mt-2 block w-full" /></label>
                    <label className="field text-sm text-muted-foreground">封面<input name="cover" type="file" accept="image/*" className="mt-2 block w-full" /></label>
                    <label className="flex min-h-12 items-center gap-2 rounded-md border border-white/10 bg-black/20 px-4 text-sm text-muted-foreground">
                      <input name="published" type="checkbox" defaultChecked />
                      对外发布
                    </label>
                    <Button radius="full">上传</Button>
                  </div>
                </form>
              ) : null}
              {status ? <p className="text-sm text-primary">{status}</p> : null}
            </Card.Body>
          </Card>

          <Card className="border border-white/10 bg-card/90">
            <Card.Header className="grid gap-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-xl font-black tracking-normal"><ListMusic size={19} /> 曲库</h2>
                <span className="text-sm text-muted-foreground">显示 {filtered.length} / {tracks.length}</span>
              </div>
              <div className="grid grid-cols-[minmax(220px,1fr)_auto] gap-3 max-sm:grid-cols-1">
                <label className="flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3">
                  <Search size={16} className="text-muted-foreground" />
                  <input className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" value={adminQuery} onChange={(event) => setAdminQuery(event.target.value)} placeholder="搜索标题、艺术家、来源、专辑" />
                </label>
                <div className="admin-filter">
                  {([
                    ["all", "全部"],
                    ["published", "已发布"],
                    ["draft", "未发布"]
                  ] as const).map(([value, label]) => (
                    <button key={value} type="button" className={publishFilter === value ? "is-active" : ""} onClick={() => setPublishFilter(value)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </Card.Header>
            <Card.Body className="grid gap-2 px-4 pb-5">
              {previewTrack ? (
                <div className="admin-preview-bar">
                  <button
                    type="button"
                    className="admin-preview-button"
                    onClick={() => void togglePreview(previewTrack)}
                    title={previewPlaying ? "暂停试听" : "继续试听"}
                  >
                    {previewPlaying ? <Pause size={17} /> : <Play size={17} />}
                  </button>
                  <div className="min-w-0">
                    <strong>{previewTrack.title}</strong>
                    <small>{formatTime(previewTime)} / {formatTime(previewDuration)}</small>
                  </div>
                  <input
                    aria-label="试听进度"
                    type="range"
                    min="0"
                    max={previewDuration || 0}
                    step="0.1"
                    value={Math.min(previewTime, previewDuration || previewTime)}
                    onChange={(event) => {
                      if (previewRef.current) previewRef.current.currentTime = Number(event.target.value);
                    }}
                  />
                </div>
              ) : null}
              {filtered.map((track) => {
                const editing = editingId === track.id;
                const isPreviewing = previewId === track.id && previewPlaying;
                return (
                  <div key={track.id} className={`admin-track ${editing ? "is-editing" : ""}`}>
                    <div className="admin-track-row">
                      <span className="admin-cover">
                        {track.coverUrl ? <img src={track.coverUrl} alt="" /> : <Music2 size={20} />}
                      </span>
                      <span className="min-w-0">
                        <strong>{track.title}</strong>
                        <small>{track.artist} · {track.source} · {track.album}</small>
                      </span>
                      <span className={`publish-pill ${track.published ? "is-live" : ""}`}>{track.published ? "已发布" : "未发布"}</span>
                      <span className="text-sm text-muted-foreground">{formatSize(track.size)}</span>
                      <div className="admin-row-actions">
                        <button
                          type="button"
                          className={`admin-icon-action ${isPreviewing ? "is-active" : ""}`}
                          onClick={() => void togglePreview(track)}
                          title={isPreviewing ? "暂停试听" : "试听"}
                        >
                          {isPreviewing ? <Pause size={16} /> : <Play size={16} />}
                        </button>
                        <button
                          type="button"
                          className={`admin-row-action ${track.published ? "is-danger" : "is-positive"}`}
                          onClick={() => void onTogglePublish(track)}
                        >
                          {track.published ? "取消发布" : "发布"}
                        </button>
                        <button type="button" className="admin-icon-action" onClick={() => setEditingId(editing ? "" : track.id)} title={editing ? "收起编辑" : "编辑"}>
                          {editing ? <X size={16} /> : <Edit3 size={16} />}
                        </button>
                      </div>
                    </div>
                    {editing ? (
                      <form onSubmit={(event) => {
                        event.preventDefault();
                        void onPatch(track, event.currentTarget).then((ok) => {
                          if (ok) setEditingId("");
                        });
                      }} className="admin-editor">
                        <label>
                          <span>歌曲标题</span>
                          <input className="field" name="title" defaultValue={track.title} />
                        </label>
                        <label>
                          <span>艺术家</span>
                          <input className="field" name="artist" defaultValue={track.artist} />
                        </label>
                        <label>
                          <span>来源/风格</span>
                          <input className="field" name="source" defaultValue={track.source} />
                        </label>
                        <label>
                          <span>专辑</span>
                          <input className="field" name="album" defaultValue={track.album} />
                        </label>
                        <label className="col-span-full">
                          <span>歌词</span>
                          <textarea className="field min-h-32" name="lyrics" defaultValue={track.lyrics} />
                        </label>
                        <label className="admin-publish-toggle col-span-full">
                          <input name="published" type="checkbox" defaultChecked={track.published} />
                          <span>
                            <strong>对外发布</strong>
                            <small>{track.published ? "取消勾选并保存后，前台电台会隐藏这首歌。" : "勾选并保存后，前台电台会显示这首歌。"}</small>
                          </span>
                        </label>
                        <div className="col-span-full flex justify-end gap-2">
                          <button type="button" className="admin-row-action" onClick={() => setEditingId("")}>取消</button>
                          <Button radius="full"><Check size={16} /> 保存</Button>
                          <button
                            type="button"
                            onClick={() => onDelete(track)}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-red-500 px-4 text-sm font-bold text-white transition hover:bg-red-400"
                          >
                            <Trash2 size={16} /> 删除
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </div>
                );
              })}
              {!filtered.length ? (
                <div className="rounded-md border border-white/10 bg-black/20 p-8 text-center text-sm text-muted-foreground">没有匹配的歌曲。</div>
              ) : null}
            </Card.Body>
          </Card>
        </>
      )}
    </main>
  );
}
