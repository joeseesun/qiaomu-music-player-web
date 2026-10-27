const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  PLAYLISTS,
  fetchPlaylist,
  shanghaiDate,
  scheduledDay,
} = require("./suno-feed");
const fail = (status, message) => Object.assign(new Error(message), { status });
class Studio {
  constructor(dir, fetcher = fetchPlaylist) {
    this.file = path.join(dir, "studio.json");
    this.fetcher = fetcher;
    this.pending = Promise.resolve();
    this.syncing = null;
    this.worker = null;
    this.state = {
      version: 1,
      feeds: {},
      preferences: {},
      jobs: [],
      lastScheduleDay: null,
    };
  }
  async init() {
    try {
      this.state = JSON.parse(await fs.readFile(this.file, "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    await this.mutate((s) => {
      for (const job of s.jobs)
        if (["running", "publishing"].includes(job.status)) {
          job.status = "blocked";
          job.error = "服务重启，需检查已有产物后恢复，未自动重复生成";
        }
    });
  }
  mutate(fn) {
    const next = this.pending.then(async () => {
      const state = structuredClone(this.state);
      const result = await fn(state);
      const tmp = `${this.file}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
      await fs.rename(tmp, this.file);
      this.state = state;
      return result;
    });
    this.pending = next.catch(() => {});
    return next;
  }
  async sync() {
    if (this.syncing) return this.syncing;
    this.syncing = (async () => {
      const results = await Promise.allSettled(
        PLAYLISTS.map((p) => this.fetcher(p.id)),
      );
      const now = new Date().toISOString();
      await this.mutate((s) => {
        results.forEach((result, i) => {
          const id = PLAYLISTS[i].id;
          const prev = s.feeds[id];
          if (result.status === "rejected") {
            s.feeds[id] = {
              ...prev,
              error: String(result.reason.message || "同步失败").slice(0, 300),
              attemptedAt: now,
            };
            return;
          }
          const oldIds = prev?.tracks?.map((t) => t.id) || [];
          const firstSeen = { ...prev?.firstSeen };
          const tracks = result.value.tracks.map((t) => {
            const previous = prev?.tracks?.find((old) => old.id === t.id);
            firstSeen[t.id] ||= now;
            return {
              ...t,
              firstSeenAt: firstSeen[t.id],
              previousPosition: previous?.position ?? null,
            };
          });
          s.feeds[id] = {
            ...result.value,
            tracks,
            firstSeen,
            updatedAt: now,
            attemptedAt: now,
            error: "",
            removedIds: oldIds.filter((id) => !tracks.some((t) => t.id === id)),
          };
        });
        if (results.every((r) => r.status === "fulfilled"))
          s.lastScheduleDay = scheduledDay();
      });
      return this.snapshot(false);
    })().finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }
  snapshot(admin) {
    const unique = new Map();
    const playlists = PLAYLISTS.map((p) => {
      const feed = this.state.feeds[p.id];
      for (const track of feed?.tracks || []) {
        if (!unique.has(track.id))
          unique.set(track.id, {
            ...track,
            sources: [],
            preference: admin ? this.state.preferences[track.id] || {} : {},
          });
        const t = unique.get(track.id);
        if (track.firstSeenAt < t.firstSeenAt)
          t.firstSeenAt = track.firstSeenAt;
        t.sources.push({
          id: p.id,
          position: track.position,
          previousPosition: track.previousPosition,
        });
      }
      return {
        ...p,
        count: feed?.tracks?.length || 0,
        updatedAt: feed?.updatedAt,
        error: feed?.error,
        removedCount: feed?.removedIds?.length || 0,
      };
    });
    const worker =
      this.worker && Date.now() - Date.parse(this.worker.at) < 90000
        ? this.worker
        : { ready: false, message: "创作执行器离线，任务会保留在队列中" };
    return {
      playlists,
      tracks: [...unique.values()],
      today: shanghaiDate(),
      schedule: "每天 09:00 · 北京时间",
      syncing: !!this.syncing,
      ...(admin
        ? {
            jobs: this.state.jobs
              .slice(-100)
              .reverse()
              .map(({ lease, ...j }) => j),
            worker,
          }
        : {}),
    };
  }
  findTrack(id) {
    return this.snapshot(false).tracks.find((t) => t.id === id);
  }
  preference(id, values) {
    if (!this.findTrack(id)) throw fail(404, "歌曲不存在");
    return this.mutate((s) => {
      const pref = s.preferences[id] || {};
      for (const key of ["heard", "favorite", "hidden"])
        if (typeof values[key] === "boolean") pref[key] = values[key];
      s.preferences[id] = pref;
      return pref;
    });
  }
  createJob(body) {
    const reference = this.findTrack(body.trackId);
    if (!reference) throw fail(404, "参考歌曲不存在，请刷新歌单");
    const brief = String(body.brief || "")
      .trim()
      .slice(0, 1000);
    return this.mutate((s) => {
      const duplicate = s.jobs.find(
        (j) =>
          j.reference.id === reference.id &&
          j.brief === brief &&
          !["cancelled", "published", "failed"].includes(j.status),
      );
      if (duplicate) return duplicate;
      if (
        s.jobs.filter((j) =>
          ["queued", "running", "blocked"].includes(j.status),
        ).length >= 10
      )
        throw fail(409, "待处理任务已达 10 个，请先完成或取消已有任务");
      const job = {
        id: crypto.randomUUID(),
        reference,
        brief,
        mode: "inspired-original",
        status: "queued",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        candidates: [],
        error: "",
        maxGenerations: 1,
      };
      s.jobs.push(job);
      return job;
    });
  }
  async claim(body) {
    this.worker = {
      ready: body.ready === true,
      message: String(body.message || "").slice(0, 300),
      at: new Date().toISOString(),
    };
    return this.mutate((s) => {
      for (const j of s.jobs)
        if (
          j.status === "running" &&
          Date.now() - Date.parse(j.updatedAt) > 1800000
        ) {
          j.status = "blocked";
          j.error = "执行超时，请检查已有 Suno 歌曲；不会自动重复扣费";
          delete j.lease;
        }
      if (!this.worker.ready || s.jobs.some((j) => j.status === "running"))
        return null;
      const job = s.jobs.find((j) => j.status === "queued");
      if (!job) return null;
      job.status = "running";
      job.lease = crypto.randomUUID();
      job.updatedAt = new Date().toISOString();
      return structuredClone(job);
    });
  }
  async progress(id, body) {
    return this.mutate((s) => {
      const job = s.jobs.find((j) => j.id === id);
      if (!job || job.status !== "running" || body.lease !== job.lease)
        throw fail(409, "任务执行权已失效");
      if (body.plan) {
        if (
          typeof body.plan.title !== "string" ||
          typeof body.plan.lyrics !== "string" ||
          typeof body.plan.style !== "string"
        )
          throw fail(400, "创作方案格式错误");
        job.plan = {
          title: body.plan.title.slice(0, 160),
          lyrics: body.plan.lyrics.slice(0, 12000),
          style: body.plan.style.slice(0, 1000),
          notes: String(body.plan.notes || "").slice(0, 2000),
          audioAnalyzed: body.plan.audioAnalyzed === true,
        };
      }
      if (body.songIds) {
        if (
          !Array.isArray(body.songIds) ||
          body.songIds.length > 2 ||
          body.songIds.some((x) => !/^[a-f0-9-]{36}$/i.test(x))
        )
          throw fail(400, "歌曲 ID 无效");
        job.songIds = body.songIds;
      }
      if (body.generationStarted === true) job.generationStarted = true;
      if (body.status === "blocked" || body.status === "failed") {
        job.status = body.status;
        job.error = String(body.error || "执行未完成").slice(0, 600);
        delete job.lease;
      }
      if (body.status === "review") {
        if (!job.candidates.length) throw fail(409, "尚无可试听候选");
        job.status = "review";
        delete job.lease;
      }
      job.updatedAt = new Date().toISOString();
      return { ok: true };
    });
  }
  async cancel(id) {
    return this.mutate((s) => {
      const job = s.jobs.find((j) => j.id === id);
      if (!job || !["queued", "blocked", "failed"].includes(job.status))
        throw fail(409, "只能取消未执行或已停止的任务");
      job.status = "cancelled";
      delete job.lease;
      return { ok: true };
    });
  }
  async resume(id) {
    return this.mutate((s) => {
      const job = s.jobs.find((j) => j.id === id);
      if (!job || !["blocked", "failed"].includes(job.status))
        throw fail(409, "任务不能恢复");
      if (job.generationStarted && !job.songIds?.length)
        throw fail(409, "请先核对 Suno 生成记录，避免重复扣费");
      job.status = "queued";
      job.error = "";
      delete job.lease;
      return { ok: true };
    });
  }
  async attach(id, links) {
    const items = String(links || "")
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean);
    const ids = [
      ...new Set(
        items.map((item) => {
          const match =
            /^(?:https:\/\/suno\.com\/song\/)?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:\?[^\s]*)?$/i.exec(
              item,
            );
          if (!match) throw fail(400, "请粘贴 suno.com/song/ 开头的歌曲链接");
          return match[1].toLowerCase();
        }),
      ),
    ];
    if (!ids.length || ids.length > 2)
      throw fail(400, "每次关联 1–2 首候选歌曲");
    return this.mutate((s) => {
      const job = s.jobs.find((j) => j.id === id);
      if (!job || !["blocked", "failed"].includes(job.status) || !job.plan)
        throw fail(409, "仅能关联已生成方案且暂停的任务");
      if (job.candidates.length)
        throw fail(409, "已有候选，请恢复已有歌曲的处理");
      job.songIds = ids;
      job.generationStarted = true;
      job.status = "queued";
      job.error = "";
      delete job.lease;
      return { ok: true };
    });
  }
  start() {
    let lastAttempt = 0;
    const tick = () => {
      if (
        this.state.lastScheduleDay === scheduledDay() ||
        Date.now() - lastAttempt < 1800000
      )
        return;
      lastAttempt = Date.now();
      this.sync().catch(() => {});
    };
    tick();
    this.timer = setInterval(tick, 60000);
    this.timer.unref();
  }
}
module.exports = { Studio, fail };
