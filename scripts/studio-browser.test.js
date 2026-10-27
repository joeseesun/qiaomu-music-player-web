const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function fixture(t, state) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'qm-browser-'));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  await fs.writeFile(path.join(folder, 'plan.json'), JSON.stringify({ title: 'Test song' }));
  await fs.writeFile(path.join(folder, 'browser-state.json'), JSON.stringify(state));
  const source = await fs.readFile(path.join(__dirname, 'studio-browser.js'), 'utf8');
  const run = new AsyncFunction('studioInput', 'taskSpace', 'takeOverTaskSpace', 'console', source);
  return { folder, run };
}

test('checking a submitted job recovers IDs without clicking Create', async t => {
  const { folder, run } = await fixture(t, { spaceId: 83, phase: 'submitted', baseline: [] });
  let claimed = 0; const reports = [];
  const ids = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'];
  const page = { url: async () => 'https://suno.com/create', evaluate: async () => ids,
    click: async () => assert.fail('must never click during result check') };
  await run({ folder, check: true }, () => assert.fail('requires explicit continuation'), async id => {
    assert.equal(id, 83); claimed++; return { page: () => page };
  }, { log: value => reports.push(value) });
  assert.equal(claimed, 1);
  assert.deepEqual(JSON.parse(reports[0].split('=')[1]).ids, ids);
  const saved = JSON.parse(await fs.readFile(path.join(folder, 'browser-state.json')));
  assert.equal(saved.phase, 'complete');
});

test('interrupted one-result wait performs no more browser operations', async t => {
  const { folder, run } = await fixture(t, { spaceId: 83, phase: 'submitted', baseline: [] });
  let stopped = false; const reports = [];
  const page = { url: async () => 'https://suno.com/create', evaluate: async () => {
    assert.equal(stopped, false, 'must stop immediately after user takeover');
    return ['11111111-1111-1111-1111-111111111111'];
  }, waitForFunction: async () => { stopped = true; throw Error('paused: control belongs to user'); },
  screenshot: async () => assert.fail('no screenshot after takeover'),
  click: async () => assert.fail('no click while checking') };
  await run({ folder, check: true }, () => assert.fail(), async () => ({ page: () => page }), { log: v => reports.push(v) });
  assert.equal(JSON.parse(reports[0].split('=')[1]).pending, true);
});

test('persisted IDs are reused without opening or reclaiming a browser', async t => {
  const ids = ['11111111-1111-1111-1111-111111111111'];
  const { folder, run } = await fixture(t, { ids, phase: 'complete' });
  const reports = [];
  await run({ folder, check: true }, () => assert.fail(), () => assert.fail(), { log: v => reports.push(v) });
  assert.deepEqual(JSON.parse(reports[0].split('=')[1]).ids, ids);
});
