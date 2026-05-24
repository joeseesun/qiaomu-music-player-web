const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const url = process.env.SCREENSHOT_URL || "http://127.0.0.1:5173";
const outDir = path.join(__dirname, "..", "docs", "assets");

const demoTracks = [
  {
    id: "demo-sunrise",
    title: "Sunrise Circuit",
    artist: "Qiaomu",
    source: "AI Disco / Dance Pop",
    album: "Open Radio Demo",
    file: "demo-sunrise.mp3",
    size: 5820000,
    contentType: "audio/mpeg",
    lyrics: "[00:00] Lights on the window\n[00:15] City starts to move\n[00:30] We tune the morning in",
    published: true,
    createdAt: "2026-05-24T00:00:00.000Z",
    updatedAt: "2026-05-24T00:00:00.000Z",
    url: "/music/demo-sunrise.mp3"
  },
  {
    id: "demo-draft",
    title: "Private Draft Groove",
    artist: "Qiaomu",
    source: "Draft / Funk",
    album: "Admin Shelf",
    file: "demo-draft.mp3",
    size: 4210000,
    contentType: "audio/mpeg",
    lyrics: "",
    published: false,
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z",
    url: "/music/demo-draft.mp3"
  }
];

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.route("**/api/tracks", (route) => route.fulfill({
    json: { tracks: demoTracks.filter((track) => track.published) }
  }));
  await page.route("**/api/admin/tracks", (route) => route.fulfill({
    json: { tracks: demoTracks }
  }));
  await page.route("**/api/me", (route) => route.fulfill({
    json: { admin: true }
  }));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.screenshot({
    path: path.join(outDir, "product-screenshot.png"),
    fullPage: true
  });
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
