# Qiaomu Music iOS

> 基于 Qiaomu Music Player Web 公开播放 API 的 SwiftUI iPhone 客户端。
> A SwiftUI iPhone client for the public playback API exposed by Qiaomu Music Player Web.

**中文** | [English](#english)

## 中文

这个 App 默认连接 `https://music.qiaomu.ai`，读取 `GET /api/public/tracks` 返回的已发布歌曲，用接近 Apple Music 的方式浏览、搜索、播放和查看歌词。

### 功能

- 拉取 `GET /api/public/tracks` 的公开曲库。
- 使用 `AVPlayer` 串流播放 `audioUrl`，支持后台音频和锁屏控制。
- 从 `lyricsUrl` 获取同步歌词，支持点按有时间戳的歌词跳转。
- Apple Music 风格结构：资料库、搜索、底部 mini player、全屏正在播放页。
- 设置页可在 `https://music.qiaomu.ai` 和本地 `http://127.0.0.1:3068` 之间切换。

### 运行

```bash
open ios/QiaomuMusic/QiaomuMusic.xcodeproj
```

命令行验证：

```bash
xcodebuild -project ios/QiaomuMusic/QiaomuMusic.xcodeproj -target QiaomuMusic -configuration Debug -sdk iphonesimulator build
xcodebuild -project ios/QiaomuMusic/QiaomuMusic.xcodeproj -target QiaomuMusic -configuration Debug -sdk iphoneos CODE_SIGNING_ALLOWED=NO build
```

在 iOS 模拟器里测试本地服务时，先在 Mac 上启动 Node 服务，然后在 App 设置里把 API URL 改成 `http://127.0.0.1:3068`。

---

<a name="english"></a>
## English

This app defaults to `https://music.qiaomu.ai`, loads published tracks from `GET /api/public/tracks`, and provides an Apple Music inspired browsing, search, playback, and lyrics experience.

### Features

- Loads published tracks from `GET /api/public/tracks`.
- Streams `audioUrl` with `AVPlayer`, including lock-screen/background audio support.
- Fetches synced lyrics from `lyricsUrl` and supports tap-to-seek on timed lyric lines.
- Uses an Apple Music inspired layout: library, search, mini player, and full now-playing screen.
- Defaults to `https://music.qiaomu.ai`, with a settings sheet for local development.

## Run

```bash
open ios/QiaomuMusic/QiaomuMusic.xcodeproj
```

For CLI validation:

```bash
xcodebuild -project ios/QiaomuMusic/QiaomuMusic.xcodeproj -target QiaomuMusic -configuration Debug -sdk iphonesimulator build
xcodebuild -project ios/QiaomuMusic/QiaomuMusic.xcodeproj -target QiaomuMusic -configuration Debug -sdk iphoneos CODE_SIGNING_ALLOWED=NO build
```

When testing against the local web server in the iOS simulator, start the Node service on the Mac and set the app API URL to `http://127.0.0.1:3068`.
