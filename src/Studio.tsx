import { audioCache } from '../public/audio-cache.mjs';
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowUpRight,
  Check,
  Headphones,
  Heart,
  Loader2,
  Music2,
  Pause,
  Play,
  RefreshCw,
  Search,
  SkipForward,
  Sparkles,
  X,
} from "lucide-react";
import "./studio.css";

type Song = {
  id: string;
  title: string;
  artist: string;
  tags: string;
  audioUrl: string;
  coverUrl: string;
  duration: number;
  plays: number;
  sourceUrl: string;
  firstSeenAt: string;
  sources: { id: string; position: number; previousPosition?: number }[];
  preference: { heard?: boolean; favorite?: boolean; hidden?: boolean };
};
type Job = {
  id: string;
  reference: Song;
  brief: string;
  status: string;
  error?: string;
  publicPath?: string;
  generationStarted?: boolean;
  browserPending?: boolean;
  stage?: string;
  plan?: {
    title: string;
    lyrics: string;
    style: string;
    notes: string;
    audioAnalyzed: boolean;
  };
  songIds?: string[];
  candidates: {
    trackId: string;
    title: string;
    audioUrl: string;
    coverUrl: string;
  }[];
};
type State = {
  playlists: {
    id: string;
    name: string;
    title: string;
    count: number;
    updatedAt?: string;
    error?: string;
  }[];
  tracks: Song[];
  jobs: Job[];
  today: string;
  schedule: string;
  worker: { ready: boolean; message: string };
};
const statuses: Record<string, string> = {
  queued: "等待创作",
  running: "正在创作",
  blocked: "需要处理",
  failed: "未完成",
  review: "等待试听",
  published: "已发布",
  cancelled: "已取消",
};
const duration = (n: number) =>
  `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
const localDay = (iso: string) =>
  new Date(Date.parse(iso) + 8 * 3600000).toISOString().slice(0, 10);
async function request(url: string, method = "GET", body?: unknown) {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败，请稍后再试");
  return data;
}
export default function Studio({
  admin,
  onLogin,
  loginStatus,
  onPlay,
  onPublished,
}: {
  admin: boolean;
  onLogin: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  loginStatus: string;
  onPlay: () => void;
  onPublished: () => void;
}) {
  const [data, setData] = useState<State>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [selected, setSelected] = useState<Song>();
  const [brief, setBrief] = useState("");
  const [playing, setPlaying] = useState<{
    id: string;
    title: string;
    artist: string;
    url: string;
    cover: string;
    sourceUrl?: string;
  }>();
  const [isPlaying, setIsPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(0);
  const audio = useRef<HTMLAudioElement>(null);
  const busyRef = useRef(false);
  const refresh = async () => {
    try {
      setData(await request("/api/studio"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    if (!admin) return;
    void refresh();
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, [admin]);
  useEffect(() => {
    if (admin && tab === 'jobs' && !isPlaying) {
      const candidates = data?.jobs.flatMap(j => j.candidates).slice(0, 2) || [];
      candidates.forEach(c => void audioCache.preload(c.audioUrl));
    }
  }, [admin, tab, data?.jobs, isPlaying]);
  useEffect(() => () => { audioCache.pin('studio', ''); audioCache.clearPrivate(); }, []);
  const run = async (key: string, action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(key);
    setNotice("");
    try {
      await action();
      await refresh();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy("");
      busyRef.current = false;
    }
  };
  const songs = useMemo(
    () =>
      (data?.tracks || [])
        .filter((t) => {
          if (tab === "hidden" ? !t.preference.hidden : t.preference.hidden)
            return false;
          if (tab === "new" && localDay(t.firstSeenAt) !== data?.today)
            return false;
          if (tab === "unheard" && t.preference.heard) return false;
          if (tab === "favorites" && !t.preference.favorite) return false;
          if (
            !["all", "new", "unheard", "favorites", "hidden", "jobs"].includes(
              tab,
            ) &&
            !t.sources.some((s) => s.id === tab)
          )
            return false;
          return `${t.title} ${t.artist} ${t.tags}`
            .toLowerCase()
            .includes(query.toLowerCase());
        })
        .sort((a, b) => {
          if (data?.playlists.some((p) => p.id === tab))
            return (
              a.sources.find((s) => s.id === tab)!.position -
              b.sources.find((s) => s.id === tab)!.position
            );
          return 0;
        }),
    [data, tab, query],
  );
  async function play(item: NonNullable<typeof playing>) {
    if (playing?.id === item.id && audio.current) {
      if (audio.current.paused) {
        try {
          onPlay();
          await audio.current.play();
        } catch {
          setNotice("暂时无法播放，请使用 Suno 原曲链接");
        }
      } else audio.current.pause();
      return;
    }
    audioCache.stop();
    audioCache.pin('studio', item.url);
    onPlay();
    setPlaying(item);
    setTime(0);
    setLength(0);
    if (audio.current) {
      audio.current.src = audioCache.source(item.url);
      try {
        await audio.current.play();
      } catch {
        setNotice("暂时无法播放，请使用 Suno 原曲链接");
      }
    }
  }
  const playSong = (t: Song) => {
    onPlay();
    audio.current?.pause();
    setIsPlaying(false);
    window.open(t.sourceUrl, "_blank", "noopener,noreferrer");
  };
  const next = () => {
    if (!songs.length) return;
    const i = songs.findIndex((t) => t.id === playing?.id);
    playSong(songs[(i + 1) % songs.length]);
  };
  const pref = (song: Song, values: Record<string, boolean>) =>
    run(`pref:${song.id}`, async () => {
      await request(`/api/studio/preferences/${song.id}`, "PATCH", values);
    });
  if (!admin)
    return (
      <main className="studio studio-login">
        <span className="studio-eyebrow">QIAOMU / STUDIO</span>
        <h1>从喜欢的一首，开始创作。</h1>
        <p>
          每天更新 Suno 精选。原曲在 Suno 试听，回来创作并发布你喜欢的版本。
        </p>
        <form onSubmit={onLogin}>
          <label htmlFor="studio-password">乔木音乐后台密码</label>
          <input
            id="studio-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <button className="studio-primary" type="submit">
            进入工作台 <ArrowUpRight size={16} />
          </button>
          <p role="status">{loginStatus}</p>
        </form>
        <a href="/">返回乔木音乐</a>
      </main>
    );
  return (
    <main className="studio">
      <audio
        ref={audio}
        preload="none"
        playsInline
        onTimeUpdate={() => setTime(audio.current?.currentTime || 0)}
        onLoadedMetadata={() => setLength(audio.current?.duration || 0)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => {
          setIsPlaying(true);
          const t = data?.tracks.find((t) => t.id === playing?.id);
          if (t && !t.preference.heard) void pref(t, { heard: true });
        }}
        onEnded={next}
        onError={() =>
          setNotice("音频暂时不可用，可以刷新歌单或在 Suno 打开原曲")
        }
      />
      <header className="studio-header">
        <div>
          <span className="studio-eyebrow">QIAOMU / STUDIO</span>
          <h1>把喜欢，听成灵感。</h1>
          <p>
            {data?.schedule || "每天 09:00 · 北京时间"} <span>·</span>{" "}
            两份精选，每天发现新灵感。
          </p>
        </div>
        <button
          disabled={!!busy}
          onClick={() =>
            void run("sync", async () => {
              await request("/api/studio/sync", "POST", {});
              setNotice("歌单已检查，原有收藏和已听记录已保留");
            })
          }
        >
          <RefreshCw
            size={16}
            className={busy === "sync" ? "studio-spin" : ""}
          />{" "}
          更新歌单
        </button>
      </header>
      {error && (
        <div role="alert" className="studio-message">
          {error}
          <button onClick={() => void refresh()}>重试</button>
        </div>
      )}
      {notice && (
        <div role="status" className="studio-message">
          {notice}
          <button aria-label="关闭提示" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
      <nav className="studio-tabs" aria-label="歌单和创作任务">
        {[
          ["all", "全部精选"],
          ["new", "今日新增"],
          ...(data?.playlists || []).map((p) => [p.id, p.name]),
          [
            "jobs",
            `我的创作${data?.jobs.filter((j) => !["cancelled", "published"].includes(j.status)).length ? ` · ${data.jobs.filter((j) => !["cancelled", "published"].includes(j.status)).length}` : ""}`,
          ],
        ].map(([id, name]) => (
          <button
            key={id}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id)}
          >
            {name}
          </button>
        ))}
      </nav>
      {tab === "jobs" ? (
        <section className="studio-jobs">
          <div className="studio-worker">
            <span className={data?.worker.ready ? "online" : ""} />
            {data?.worker.message || "正在检查创作执行器"}
          </div>
          {data?.jobs.filter((j) => j.status !== "cancelled").length === 0 && (
            <div className="studio-empty">
              <Sparkles />
              <h2>让第一首灵感落地</h2>
              <p>试听精选歌曲，点击「模仿这首」即可开始。</p>
              <button onClick={() => setTab("all")}>去听精选</button>
            </div>
          )}
          {data?.jobs
            .filter((j) => j.status !== "cancelled")
            .map((job) => (
              <article key={job.id} className="studio-job">
                <header>
                  <div>
                    <small>参考 · {job.reference.title}</small>
                    <h2>{job.plan?.title || "新的创作"}</h2>
                  </div>
                  <span className="studio-status">
                    {job.status === "running" && (
                      <Loader2 size={14} className="studio-spin" />
                    )}
                    {job.status === 'running' ? job.stage || statuses.running : job.status === 'blocked' && job.browserPending ? '等待 Suno 网页操作' : statuses[job.status] || job.status}
                  </span>
                </header>
                {job.brief && <p>{job.brief}</p>}
                {job.error && (
                  <p role="alert" className="studio-job-error">
                    {job.error}
                  </p>
                )}
                {job.plan && (
                  <details>
                    <summary>查看歌词与风格方案</summary>
                    <p>
                      {job.plan.audioAnalyzed
                        ? "根据音频与公开风格分析"
                        : "根据公开风格信息；尚未完成音频分析"}
                    </p>
                    <p>{job.plan.notes}</p>
                    <p className="studio-style">{job.plan.style}</p>
                    <pre>{job.plan.lyrics}</pre>
                  </details>
                )}
                <div className="studio-candidates">
                  {job.candidates.map((c, i) => (
                    <div key={c.trackId}>
                      <button
                        onClick={() =>
                          void play({
                            id: c.trackId,
                            title: c.title,
                            artist: `候选 ${String.fromCharCode(65 + i)}`,
                            url: c.audioUrl,
                            cover: c.coverUrl,
                          })
                        }
                        onPointerEnter={() => void audioCache.preload(c.audioUrl)}
                        onFocus={() => void audioCache.preload(c.audioUrl)}
                        aria-label={`试听候选 ${String.fromCharCode(65 + i)}`}
                      >
                        {playing?.id === c.trackId && isPlaying ? (
                          <Pause size={18} />
                        ) : (
                          <Play size={18} />
                        )}
                        <span>
                          {String.fromCharCode(65 + i)} · {c.title}
                        </span>
                      </button>
                      {job.status === "review" && (
                        <button
                          className="studio-primary"
                          disabled={!!busy}
                          onClick={() =>
                            void run(`publish:${job.id}`, async () => {
                              const result = await request(
                                `/api/studio/jobs/${job.id}/publish`,
                                "POST",
                                { trackId: c.trackId },
                              );
                              await request(
                                `/api/public/tracks/${result.trackId}`,
                              );
                              onPublished();
                              setNotice("已发布到乔木音乐");
                            })
                          }
                        >
                          发布这版 <ArrowUpRight size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {job.publicPath && (
                  <a href={job.publicPath}>
                    打开已发布歌曲 <ArrowUpRight size={15} />
                  </a>
                )}
                {job.status === 'blocked' && job.browserPending && (
                  <div className="studio-browser-resume">
                    <p>请在本机 Ego Lite 的 Suno 页面完成验证或查看生成结果。点击下方按钮表示交回浏览器控制，只检查已有结果，不再点击创建。</p>
                    <button className="studio-primary" disabled={!!busy} onClick={() => void run(`browser:${job.id}`, async () => {
                      await request(`/api/studio/jobs/${job.id}/browser-check`, 'POST', {});
                      setNotice('已请求检查 Suno 生成结果，不会再次创建');
                    })}>已完成操作，检查生成结果</button>
                  </div>
                )}
                {job.status === "blocked" &&
                  job.plan &&
                  !job.candidates.length && (
                    <details>
                      <summary>在 Suno 完成后关联候选</summary>
                      <p>
                        在你的 Suno
                        账号中使用上面的歌词和风格生成歌曲，再粘贴这次生成的 1–2
                        个歌曲链接。系统会继续下载、同步歌词和准备发布。
                      </p>
                      <a
                        href="https://suno.com/create"
                        target="_blank"
                        rel="noreferrer"
                      >
                        打开 Suno 创作 <ArrowUpRight size={14} />
                      </a>
                      <form
                        className="studio-attach"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const links = new FormData(e.currentTarget).get(
                            "links",
                          );
                          void run(`attach:${job.id}`, async () => {
                            await request(
                              `/api/studio/jobs/${job.id}/attach`,
                              "POST",
                              { links },
                            );
                          });
                        }}
                      >
                        <textarea
                          name="links"
                          aria-label="生成的 Suno 歌曲链接"
                          placeholder="https://suno.com/song/…"
                          required
                        />
                        <button disabled={!!busy} type="submit">
                          关联并继续
                        </button>
                      </form>
                    </details>
                  )}
                {job.songIds?.length && !job.candidates.length ? (
                  <p>
                    {job.songIds.map((id, i) => (
                      <a
                        key={id}
                        href={`https://suno.com/song/${id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Suno 候选 {i + 1} ↗{" "}
                      </a>
                    ))}
                  </p>
                ) : null}
                {["blocked", "failed"].includes(job.status) &&
                  (!job.generationStarted || !!job.songIds?.length) && (
                    <button
                      disabled={!!busy}
                      onClick={() =>
                        void run(`resume:${job.id}`, async () => {
                          await request(
                            `/api/studio/jobs/${job.id}/resume`,
                            "POST",
                            {},
                          );
                        })
                      }
                    >
                      {job.songIds?.length ? "恢复已有歌曲的处理" : "重试创作"}
                    </button>
                  )}
                {["queued", "blocked", "failed"].includes(job.status) && (
                  <button
                    disabled={!!busy}
                    onClick={() =>
                      void run(`cancel:${job.id}`, async () => {
                        await request(
                          `/api/studio/jobs/${job.id}/cancel`,
                          "POST",
                          {},
                        );
                      })
                    }
                  >
                    取消任务
                  </button>
                )}
              </article>
            ))}
        </section>
      ) : (
        <>
          <div className="studio-toolbar">
            <label>
              <Search size={16} />
              <input
                aria-label="搜索精选歌曲"
                placeholder="歌曲、作者或风格"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div>
              {[
                ["unheard", "未听"],
                ["favorites", "收藏"],
                ["hidden", "已隐藏"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={tab === id}
                  onClick={() => setTab(tab === id ? "all" : id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <small>{songs.length} 首</small>
          </div>
          <p className="studio-playback-note">
            原曲在 Suno
            打开，创作候选在本页试听。听完可标记「已听」，再点「模仿这首」。
          </p>
          <div className="studio-sync-info">
            {data?.playlists
              .filter(
                (p) =>
                  tab === p.id || !data.playlists.some((p) => p.id === tab),
              )
              .map((p) => (
                <span key={p.id}>
                  {p.name} ·{" "}
                  {p.error ||
                    (p.updatedAt
                      ? `更新于 ${new Date(p.updatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}`
                      : "正在同步")}
                </span>
              ))}
          </div>
          {!data ? (
            <div className="studio-empty">
              <Loader2 className="studio-spin" />
              <p>正在加载精选歌曲</p>
            </div>
          ) : !songs.length ? (
            <div className="studio-empty">
              <Headphones />
              <h2>
                {tab === "new" ? "今天还没有新增歌曲" : "这里暂时没有歌曲"}
              </h2>
              <p>歌单没有变化时保留原来的内容，收藏和已听记录不会丢失。</p>
              <button
                onClick={() => {
                  setTab("all");
                  setQuery("");
                }}
              >
                查看全部精选
              </button>
            </div>
          ) : (
            <div className="studio-songlist">
              {songs.map((song, i) => (
                <article
                  className={`studio-song ${playing?.id === song.id ? "current" : ""}`}
                  key={song.id}
                >
                  <span className="studio-rank">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <button
                    className="studio-cover"
                    aria-label={`在 Suno 试听 ${song.title}`}
                    onClick={() => playSong(song)}
                  >
                    {song.coverUrl ? (
                      <img src={song.coverUrl} alt="" loading="lazy" />
                    ) : (
                      <Music2 />
                    )}
                    <span>
                      {playing?.id === song.id && isPlaying ? (
                        <Pause size={19} />
                      ) : (
                        <Play size={19} />
                      )}
                    </span>
                  </button>
                  <div className="studio-song-meta">
                    <button onClick={() => playSong(song)}>{song.title}</button>
                    <p>
                      {song.artist}
                      {song.preference.heard && (
                        <Check size={12} aria-label="已听" />
                      )}
                      <span>· {duration(song.duration)}</span>
                    </p>
                    <small>{song.tags || "风格待分析"}</small>
                  </div>
                  <div className="studio-song-actions">
                    <button
                      title={song.preference.heard ? "标为未听" : "标为已听"}
                      aria-label={`${song.preference.heard ? "标为未听" : "标为已听"} ${song.title}`}
                      aria-pressed={!!song.preference.heard}
                      disabled={!!busy}
                      onClick={() =>
                        void pref(song, { heard: !song.preference.heard })
                      }
                    >
                      <Check size={16} />
                    </button>
                    <button
                      title={song.preference.favorite ? "取消收藏" : "收藏"}
                      aria-label={`${song.preference.favorite ? "取消收藏" : "收藏"} ${song.title}`}
                      aria-pressed={!!song.preference.favorite}
                      disabled={!!busy}
                      onClick={() =>
                        void pref(song, { favorite: !song.preference.favorite })
                      }
                    >
                      <Heart
                        size={17}
                        fill={
                          song.preference.favorite ? "currentColor" : "none"
                        }
                      />
                    </button>
                    <button
                      className="studio-imitate"
                      onClick={() => {
                        setSelected(song);
                        setBrief("");
                      }}
                    >
                      <Sparkles size={15} />
                      模仿这首
                    </button>
                    <a
                      href={song.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="在 Suno 打开"
                      aria-label={`在 Suno 打开 ${song.title}`}
                    >
                      <ArrowUpRight size={17} />
                    </a>
                    <button
                      title={song.preference.hidden ? "恢复显示" : "不感兴趣"}
                      aria-label={`${song.preference.hidden ? "恢复显示" : "不感兴趣"} ${song.title}`}
                      disabled={!!busy}
                      onClick={() =>
                        void pref(song, { hidden: !song.preference.hidden })
                      }
                    >
                      {song.preference.hidden ? (
                        <RefreshCw size={14} />
                      ) : (
                        <X size={14} />
                      )}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
      {selected && (
        <section className="studio-composer" aria-label="模仿创作">
          <header>
            <div>
              <small>参考 · {selected.artist}</small>
              <h2>{selected.title}</h2>
            </div>
            <button
              aria-label="关闭创作"
              onClick={() => setSelected(undefined)}
            >
              <X size={19} />
            </button>
          </header>
          <p>
            借鉴节奏、配器和情绪，创作全新歌词与旋律。每次生成一组候选，试听后选一版发布。
          </p>
          <label htmlFor="studio-brief">你想怎么改？</label>
          <textarea
            id="studio-brief"
            value={brief}
            maxLength={1000}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="例如：中文女声，保留轻快节奏，副歌更抓耳。留空则沿用原曲的风格方向。"
          />
          <small>
            {data?.worker.ready
              ? "执行器已连接 · 生成将消耗 Suno 额度"
              : data?.worker.message}
          </small>
          <button
            className="studio-primary"
            disabled={!!busy}
            onClick={() =>
              void run("create", async () => {
                await request("/api/studio/jobs", "POST", {
                  trackId: selected.id,
                  brief,
                });
                setSelected(undefined);
                setTab("jobs");
              })
            }
          >
            <Sparkles size={16} />
            {busy === "create" ? "正在提交" : "开始创作"}
          </button>
        </section>
      )}
      {playing ? (
        <footer className="studio-player">
          <img src={playing.cover || undefined} alt="" />
          <div>
            <strong>{playing.title}</strong>
            <small>{playing.artist}</small>
          </div>
          <button
            aria-label={isPlaying ? "暂停播放" : "继续播放"}
            onClick={() => void play(playing)}
          >
            {isPlaying ? <Pause /> : <Play />}
          </button>
          <button
            aria-label="关闭试听"
            onClick={() => {
              audio.current?.pause();
              setPlaying(undefined);
            }}
          >
            <X size={20} />
          </button>
          <span>{duration(time)}</span>
          <input
            aria-label="试听进度"
            type="range"
            min="0"
            max={length || 1}
            step="0.1"
            value={time}
            disabled={!length}
            onChange={(e) => {
              if (audio.current)
                audio.current.currentTime = Number(e.target.value);
            }}
          />
          <span>{duration(length)}</span>
        </footer>
      ) : null}
    </main>
  );
}
