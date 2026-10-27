// Executed by `ego-browser nodejs`, with studioInput supplied as JSON by the worker.
// One visible Create click at most. Human challenges are handed off, never solved.
const fs = await import('node:fs/promises');
const path = await import('node:path');
const input = studioInput;
const stateFile = path.join(input.folder, 'browser-state.json');
const plan = JSON.parse(await fs.readFile(path.join(input.folder, 'plan.json'), 'utf8'));
let state = {};
try { state = JSON.parse(await fs.readFile(stateFile, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const saveState = async () => {
  await fs.writeFile(stateFile + '.tmp', JSON.stringify(state), { mode: 0o600 });
  await fs.rename(stateFile + '.tmp', stateFile);
};
const report = (value) => console.log('QM_BROWSER_RESULT=' + JSON.stringify(value));
let task;
let page;
const newIds = () => page.evaluate(({ title, baseline }) => [...new Set(
  [...document.querySelectorAll('a[href^="/song/"]')]
    .filter(a => a.textContent.trim() === title)
    .map(a => /^\/song\/([a-f0-9-]{36})(?:\?|$)/i.exec(a.getAttribute('href'))?.[1])
    .filter(id => id && !baseline.includes(id))
)], { title: plan.title, baseline: state.baseline || [] });
try {
  if (state.ids?.length) {
    report({ ids: state.ids });
  } else {
    if (input.check && !state.spaceId) throw Error('missing_browser_state');
    task = state.spaceId
      ? (input.check ? await takeOverTaskSpace(state.spaceId) : await taskSpace(state.spaceId))
      : await taskSpace('乔木音乐创作 ' + input.jobId.slice(0, 8));
    if (!state.spaceId) {
      state = { spaceId: task.spaceId, page: 'p1', phase: 'opened', owned: true };
      await saveState();
    }
    page = task.page(state.page || 'p1');
    if (!input.check && state.phase !== 'submitted') {
      await page.goto('https://suno.com/create');
      await page.waitForSelector('loc=role:tab[name="Advanced"]', { timeout: 20000 });
      await page.snapshot();
      await page.click('loc=role:tab[name="Advanced"]');
      await page.waitForSelector('[aria-label="Lyrics editor"]', { timeout: 15000 });
      state.baseline = await page.evaluate(() => [...document.querySelectorAll('a[href^="/song/"]')].map(a => a.getAttribute('href').split('/')[2]?.split('?')[0]).filter(Boolean));
      await saveState();
      const validModel = await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'v6'));
      if (!validModel) throw Error('model_selection_required');
      await page.fill('[aria-label="Lyrics editor"]', plan.lyrics);
      await page.fill('textarea[maxlength="1000"]:not([aria-label])', plan.style);
      await page.fill('input[placeholder="Song Title (Optional)"] >> nth=-1', plan.title);
      const moreClosed = await page.evaluate(() => {
        const field = document.querySelector('input[placeholder="Exclude styles"]');
        return !field || field.getBoundingClientRect().height === 0 || !field.checkVisibility();
      });
      if (moreClosed) await page.click('text="More Options"');
      await page.fill('input[placeholder="Exclude styles"]', String(plan.exclude || '').slice(0, 950));
      const ready = await page.evaluate(({ title, lyrics, style }) => {
        const editor = document.querySelector('[aria-label="Lyrics editor"]');
        const normalize = text => text.replace(/\s+/g, ' ').trim();
        return normalize(editor?.innerText || '') === normalize(lyrics)
          && [...document.querySelectorAll('input[placeholder="Song Title (Optional)"]')].at(-1)?.value === title
          && document.querySelector('textarea[maxlength="1000"]:not([aria-label])')?.value === style;
      }, plan);
      if (!ready) throw Error('form_verification_failed');
      // Persist BEFORE clicking; even a crash cannot cause a second submission.
      state.phase = 'submitted'; state.submittedAt = new Date().toISOString();
      await saveState();
      await page.click('[aria-label="Create song"]');
    } else if (!(await page.url()).startsWith('https://suno.com/')) {
      throw Error('suno_page_changed');
    }
    let ids = await newIds();
    if (!ids.length) {
      try {
        await page.waitForFunction(({ title, baseline }) => [...document.querySelectorAll('a[href^="/song/"]')].some(a => a.textContent.trim() === title && !baseline.includes(a.getAttribute('href').split('/')[2]?.split('?')[0])), { title: plan.title, baseline: state.baseline || [] }, { timeout: input.check ? 10000 : 25000 });
      } catch (error) {
        if (/control.*user|takeover|paused|inactive|unassigned/i.test(String(error))) throw error;
      }
      ids = await newIds();
    }
    if (ids.length === 1) {
      try { await page.waitForFunction(({ title, baseline }) => [...document.querySelectorAll('a[href^="/song/"]')].filter(a => a.textContent.trim() === title && !baseline.includes(a.getAttribute('href').split('/')[2]?.split('?')[0])).length >= 2, { title: plan.title, baseline: state.baseline || [] }, { timeout: 10000 }); }
      catch (error) { if (/control.*user|takeover|paused|inactive|unassigned/i.test(String(error))) throw error; }
      ids = await newIds();
    }
    if (ids.length >= 1 && ids.length <= 2) {
      state.ids = ids; state.phase = 'complete'; await saveState();
      if (state.owned) await task.finish({ keep: [] });
      report({ ids });
    } else {
      await page.screenshot({ path: path.join(input.folder, 'suno-needs-attention.png') });
      state.handedOff = true; await saveState();
      await task.handOff();
      report({ pending: true, message: ids.length > 2 ? '发现多组同名结果，请粘贴本次候选链接，未重复创建' : '已在 Ego Lite 的 Suno 页面填写并点击创建。若出现真人验证，请手动完成；不要重复点击创建。完成后回这里点「检查生成结果」。' });
    }
  }
} catch (error) {
  // A user takeover is a hard stop. Do not navigate, click, or reclaim control.
  const controlled = /control.*user|takeover|paused|inactive|unassigned/i.test(String(error));
  state.lastError = String(error).slice(0, 1200);
  if (!controlled && task && page) {
    try { await page.screenshot({ path: path.join(input.folder, 'suno-needs-attention.png') }); } catch {}
  }
  state.handedOff = true; await saveState();
  report({ pending: true, message: controlled
    ? '浏览器已由你接管，自动操作已暂停。完成 Suno 操作后，点「检查生成结果」交回控制；不会再次创建。'
    : state.phase === 'submitted'
      ? '已尝试点击 Suno 创建，但尚未确认结果。请查看 Ego Lite，完成验证后点「检查生成结果」；不要重复创建。'
      : 'Suno 自动填表在提交前停止，请查看 Ego Lite 中的创作页面并完成填写与创建。歌词方案已保留；完成后点「检查生成结果」或关联歌曲链接。' });
}
