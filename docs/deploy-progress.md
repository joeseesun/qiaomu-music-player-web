# Deployment Progress

## 2026-05-27 11:01 CST

- Target: deploy public playback API and embed script for Qiaomu Music Player Web to the VPS used by `music.qiaomu.ai`.
- Local state: API changes are implemented in `server.js`, `public/embed-player.js`, and README docs. `index.html` has a pre-existing local Umami edit that is unrelated to the API deployment.
- Plan: inspect VPS app directory, sync code without touching persisted `data/`, rebuild/restart Docker Compose, then verify `https://music.qiaomu.ai/api/public` and representative API/script endpoints.
- Completed: synced API code to `/opt/qiaomu-apps/music-player`, rebuilt `qiaomu-music-player`, and verified `https://music.qiaomu.ai/api/public`, `/api/public/tracks`, `/embed/player.js`, and lyrics output. Public API reports 21 published tracks.

## 2026-09-07 17:36 SGT

- Task: prepare Qiaomu Music iOS 1.0 for App Store review and publish required public policy/support pages.
- Target domain: `music.qiaomu.ai`.
- Local project: `/Users/joe/Dropbox/code/qiaomu-music-player-web`.
- Remote app: `/opt/qiaomu-apps/music-player` on `myvps`.
- Runtime: `qiaomu-music-player.service` (systemd), private port `127.0.0.1:3068` behind Nginx. A legacy Compose file remains in the app directory but no Compose container is running.
- Completed: iOS build 2 archived and uploaded to App Store Connect; privacy and support pages published at `/privacy/` and `/support/` without restarting the healthy Node service.
- Verified: both HTTPS pages return `200` with the expected title and contact address; systemd service remains active; port `3068` remains bound; public API returns 48 published tracks.
- Remaining: wait for Apple build processing, complete App Store metadata/privacy/content-rights/age-rating fields, select build 2, and submit for review after the owner confirms Suno commercial-use eligibility and final attestations.
- Scope: this is a narrow App Store release dependency update. Existing homepage/PWA/analytics/social affordances are left unchanged; no new growth features are introduced in this deployment.
