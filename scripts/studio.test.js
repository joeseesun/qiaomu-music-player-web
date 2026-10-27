const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { Studio } = require("../lib/studio");
const {
  parsePlaylist,
  PLAYLISTS,
  scheduledDay,
  mediaUrl,
} = require("../lib/suno-feed");
const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const song = (id) => ({
  id,
  title: id === A ? "A" : "B",
  artist: "Fixture",
  tags: "reggae",
  position: 1,
  audioUrl: "",
  sourceUrl: `https://suno.com/song/${id}`,
});
async function fixture(t, fetcher = async () => ({ tracks: [song(A)] })) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qm-studio-test-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const studio = new Studio(dir, fetcher);
  await studio.init();
  return studio;
}
test("only parse the requested playlist, preserving order and safe media", () => {
  const feed = {
    feedContainerId: PLAYLISTS[0].id,
    feedTitle: "Picks",
    items: [B, A].map((id) => ({
      contentType: "clip",
      contentItem: {
        id,
        title: id,
        mediaUrls: [
          { delivery: "progressive", url: "https://evil.invalid/file" },
        ],
        imageUrl: "javascript:alert(1)",
        metadata: { tags: "text </script>" },
      },
    })),
  };
  const html = `<script>self.__next_f.push(${JSON.stringify([1, "2:" + JSON.stringify({ arbitrary: feed }) + "\n"])})</script>`;
  assert.deepEqual(
    parsePlaylist(html, PLAYLISTS[0].id).tracks.map((t) => t.id),
    [B, A],
  );
  assert.equal(parsePlaylist(html, PLAYLISTS[0].id).tracks[0].audioUrl, "");
  assert.throws(() => parsePlaylist(html, PLAYLISTS[1].id));
  assert.equal(mediaUrl("https://cdn2.suno.ai.evil.invalid/cover"), "");
});
test("reject partial pages instead of deleting the uncrawled songs", () => {
  const value = {
    feedContainerId: PLAYLISTS[0].id,
    itemCount: 51,
    items: [{ contentType: "clip", contentItem: { id: A } }],
  };
  const html = `<script>self.__next_f.push(${JSON.stringify([1, "1:" + JSON.stringify(value)])})</script>`;
  assert.throws(() => parsePlaylist(html, PLAYLISTS[0].id), /部分/);
});
test("Shanghai daily boundary is 09:00, with yesterday catchup before 09:00", () => {
  assert.equal(scheduledDay(new Date("2026-10-27T00:59:59Z")), "2026-10-26");
  assert.equal(scheduledDay(new Date("2026-10-27T01:00:00Z")), "2026-10-27");
});
test("sync merges cross-playlist duplicates and preserves history/preferences after failures", async (t) => {
  let broken = false;
  let reversed = false;
  const s = await fixture(t, async (id) => {
    if (broken && id === PLAYLISTS[0].id) throw Error("upstream outage");
    return {
      tracks: (reversed ? [B, A] : [A, B]).map((id, i) => ({
        ...song(id),
        position: i + 1,
      })),
    };
  });
  await s.sync();
  const first = s.snapshot(true).tracks[0].firstSeenAt;
  assert.equal(s.snapshot(true).tracks.length, 2);
  assert.equal(s.snapshot(true).tracks[0].sources.length, 2);
  await s.preference(A, { favorite: true });
  reversed = true;
  await s.sync();
  assert.equal(
    s.snapshot(true).tracks.find((t) => t.id === A).firstSeenAt,
    first,
  );
  assert.equal(
    s.snapshot(true).tracks.find((t) => t.id === A).preference.favorite,
    true,
  );
  broken = true;
  await s.sync();
  assert.equal(s.snapshot(true).playlists[0].count, 2);
  assert.match(s.snapshot(true).playlists[0].error, /outage/);
  const reopened = new Studio(path.dirname(s.file));
  await reopened.init();
  assert.equal(reopened.snapshot(true).tracks.length, 2);
});
test("duplicate concurrent clicks create one job; leases block stale updates and unsafe retries", async (t) => {
  const s = await fixture(t);
  await s.sync();
  const [one, two] = await Promise.all([
    s.createJob({ trackId: A }),
    s.createJob({ trackId: A }),
  ]);
  assert.equal(one.id, two.id);
  const job = await s.claim({ ready: true });
  assert.ok(job.lease);
  assert.equal(await s.claim({ ready: true }), null);
  await assert.rejects(
    s.progress(job.id, { lease: "wrong", status: "review" }),
    /失效/,
  );
  await s.progress(job.id, { lease: job.lease, generationStarted: true });
  await s.progress(job.id, {
    lease: job.lease,
    status: "blocked",
    error: "interrupted",
  });
  await assert.rejects(s.resume(job.id), /重复扣费/);
  assert.ok(!JSON.stringify(s.snapshot(false)).includes(job.id));
  assert.ok(!s.snapshot(true).jobs[0].lease);
});
test("recover existing song IDs without creating a second generation request", async (t) => {
  const s = await fixture(t);
  await s.sync();
  await s.createJob({ trackId: A });
  const j = await s.claim({ ready: true });
  await s.progress(j.id, {
    lease: j.lease,
    generationStarted: true,
    songIds: [B],
    status: "blocked",
  });
  await s.resume(j.id);
  const next = await s.claim({ ready: true });
  assert.deepEqual(next.songIds, [B]);
  assert.notEqual(next.lease, j.lease);
});
test('browser handoff stops the queue until explicit result check and keeps the same job', async t => {
  const s = await fixture(t);
  await s.sync();
  await s.createJob({ trackId: A, brief: 'first' });
  const first = await s.claim({ ready: true });
  await assert.rejects(s.checkBrowser(first.id), /没有/);
  await s.progress(first.id, { lease: first.lease, generationStarted: true, browserPending: true, status: 'blocked', errorCode: 'browser_action_required' });
  const second = await s.createJob({ trackId: A, brief: 'second' });
  assert.equal(await s.claim({ ready: true }), null);
  await assert.rejects(s.resume(first.id), /重复扣费/);
  await s.checkBrowser(first.id);
  const resumed = await s.claim({ ready: true });
  assert.equal(resumed.id, first.id);
  assert.equal(resumed.browserAction, 'check');
  await s.progress(resumed.id, { lease: resumed.lease, songIds: [B], browserPending: false, status: 'blocked' });
  assert.equal((await s.claim({ ready: true })).id, second.id);
});
test("attach recovered Suno links only to blocked planned jobs", async (t) => {
  const s = await fixture(t);
  await s.sync();
  await s.createJob({ trackId: A });
  const j = await s.claim({ ready: true });
  await assert.rejects(s.attach(j.id, B), /暂停/);
  await s.progress(j.id, { lease: j.lease, plan: { title: "New", lyrics: "New lyrics", style: "reggae" }, status: "blocked" });
  await assert.rejects(s.attach(j.id, `https://evil.invalid/song/${B}`), /歌曲链接/);
  await assert.rejects(s.attach(j.id, ""), /1–2/);
  await s.attach(j.id, `https://suno.com/song/${B}?source=test\n${B.toUpperCase()}`);
  const next = await s.claim({ ready: true });
  assert.deepEqual(next.songIds, [B]);
  assert.equal(next.generationStarted, true);
});
test("HTTP authentication, candidate draft isolation, idempotent upload, publish and Range playback", async (t) => {
  const s = await fixture(t);
  await s.sync();
  const j = await s.createJob({ trackId: A });
  const token = "test-only-worker-token-at-least-32-chars";
  const server = spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: "0",
      DATA_DIR: path.dirname(s.file),
      ADMIN_PASSWORD: "fixture-password",
      STUDIO_WORKER_TOKEN: token,
      STUDIO_SCHEDULE: "off",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => server.kill());
  // Test hook reports the actual ephemeral listener port.
  const port = await new Promise((resolve, reject) => {
    let text = "";
    const timer = setTimeout(() => reject(Error("server timeout")), 10000);
    server.stdout.on("data", (b) => {
      text += b;
      const match = /listening on 127\.0\.0\.1:(\d+)/.exec(text);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    server.on("error", reject);
  });
  const base = `http://127.0.0.1:${port}`;
  const call = (url, options = {}) => fetch(base + url, options);
  assert.equal((await call("/api/studio")).status, 401);
  const login = await call("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "fixture-password" }),
  });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const admin = { cookie, "content-type": "application/json" };
  const worker = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
  assert.equal(
    (
      await call("/api/studio/jobs", {
        method: "POST",
        headers: { ...admin, origin: "https://evil.invalid" },
        body: "{}",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/api/studio/worker/claim", {
        method: "POST",
        headers: admin,
        body: "{}",
      })
    ).status,
    401,
  );
  const claimed = await (
    await call("/api/studio/worker/claim", {
      method: "POST",
      headers: worker,
      body: '{"ready":true}',
    })
  ).json();
  const lease = claimed.job.lease;
  const progress = (body) =>
    call(`/api/studio/worker/jobs/${j.id}`, {
      method: "PATCH",
      headers: worker,
      body: JSON.stringify({ lease, ...body }),
    });
  assert.equal((await progress({ status: "review" })).status, 409);
  assert.equal((await progress({ songIds: [B] })).status, 200);
  const form = () => {
    const value = new FormData();
    value.set("title", "Test candidate");
    value.set("lyrics", "[00:00.00]Fixture\n[00:01.00]End");
    value.set("published", "true");
    const wav = Buffer.alloc(44 + 16000);
    wav.write("RIFF");
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24);
    wav.writeUInt32LE(16000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(16000, 40);
    value.set("audio", new Blob([wav], { type: "audio/wav" }), "fixture.wav");
    value.set(
      "cover",
      new Blob(
        [
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=",
            "base64",
          ),
        ],
        { type: "image/png" },
      ),
      "fixture.png",
    );
    return value;
  };
  const upload = () =>
    call(`/api/studio/worker/jobs/${j.id}/candidates?clipId=${B}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "x-studio-lease": lease },
      body: form(),
    });
  const first = await upload();
  assert.equal(first.status, 201);
  const candidate = await first.json();
  assert.equal((await (await upload()).json()).trackId, candidate.trackId);
  assert.equal((await (await call("/api/public")).json()).trackCount, 0);
  const draft = (await (await call('/api/studio', { headers: admin })).json()).jobs[0].candidates[0];
  assert.equal((await call(draft.audioUrl)).status, 401);
  assert.equal((await call(draft.coverUrl)).status, 401);
  const draftAudio = await call(draft.audioUrl, { headers: { ...admin, Range: 'bytes=0-31' } });
  assert.equal(draftAudio.status, 206);
  assert.equal(draftAudio.headers.get('cache-control'), 'private, no-store');
  assert.equal((await progress({ status: "review" })).status, 200);
  const published = await call(`/api/studio/jobs/${j.id}/publish`, {
    method: "POST",
    headers: admin,
    body: JSON.stringify({ trackId: candidate.trackId }),
  });
  assert.equal(published.status, 200);
  const publicResult = await (
    await call(`/api/public/tracks/${candidate.trackId}`)
  ).json();
  assert.equal((await call("/api/public")).status, 200);
  const track = publicResult.track;
  const audio = await fetch(track.audioUrl, {
    headers: { Range: "bytes=0-31" },
  });
  assert.equal(audio.status, 206);
  assert.equal((await audio.arrayBuffer()).byteLength, 32);
  assert.equal((await fetch(track.coverUrl)).status, 200);
});
