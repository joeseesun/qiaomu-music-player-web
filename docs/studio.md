# Suno 发现与创作工作台

入口：`/studio`，沿用乔木音乐后台登录。

## 使用

1. 每天北京时间 09:00 自动检查 Staff Picks 与 Best of v6。首次启动补同步，失败保留缓存；页面显示每个来源的更新时间与失败原因。
2. 搜索、收藏、标为已听或隐藏。跨歌单去重，同时保留各自顺序。今日新增按北京时间首次发现日期统计。
3. 点击封面在 Suno 打开原曲，听后返回点「模仿这首」。2026-10-27 实测：这批新格式音频不能由普通 audio 标签或 Suno 官方 embed 播放；完整歌曲页面可以播放，但禁止第三方 iframe。第一版明确采用跳转，不声称站内原曲播放已实现。
4. 可填一条改写要求，或使用默认风格借鉴。系统创作全新歌词；生成一次 v6 请求，返回同一创作方案的两个演绎候选。它们不是两份独立提示词方案。
5. 在「我的创作」试听候选、查看歌词/风格/分析依据。选「发布这版」后才进入公开曲库。

原曲无法读取时使用公开风格描述，并明确标注未做音频分析；不推断听不到的速度、调性，不把他人歌词轻微改写后当作原创。第一版不执行他人原曲的直接 Cover/Remix。是否更好听由用户试听决定。

## 运行结构

- Node 服务：`lib/suno-feed.js` 读取公开页面的 Flight 数据，`lib/studio.js` 维护同步和任务。数据保存在 `DATA_DIR/studio.json`，原子替换、串行写入；不会提交 Git。
- 服务内调度：每分钟检查是否跨过北京时间 09:00；失败 30 分钟后再试；重启补跑漏掉的一次。无需电脑在线，也不依赖 Codex 聊天。
- 本机执行器：`scripts/studio-worker.py` 每 20 秒领取任务，每次最多一个。电脑睡眠或离线时任务留在服务器。Suno 账号通过 CLI 使用现有登录；无人值守路径不启动浏览器或自动解验证码，遇到这些要求停止并显示阻碍。
- 文本模型：通过 `qiaomu-llm` 注册表调用 `magpie-openai` 的 `deepseek/deepseek-flash`，不会改用 Pro；可读取音频时使用注册的 Gemini 音频输入。凭据从钥匙串读取。
- 封面：复用 `qiaomu-music-publisher` 的封面生成；上传接口强制草稿，包含音频、同步 LRC 和封面。用户试听页同时检查封面。

## 安装本机执行器

前置：Python 3、ffmpeg/ffprobe、Suno CLI 0.10.1+，已登录 Suno；个人 skill 源目录含 qiaomu-llm、qiaomu-suno-master、qiaomu-music-publisher、qiaomu-image-generator。

服务端设置至少 32 字符的 `STUDIO_WORKER_TOKEN`。本机将同一值存入钥匙串，service 为 `qiaomu-music-studio`、account 为 `worker`，避免放进命令历史或 Git。本机配置 `~/.config/qiaomu-music-studio/worker.json` 只含：

```json
{"base_url":"https://music.qiaomu.ai"}
```

```bash
python3 scripts/studio-worker.py --once
python3 scripts/studio-worker.py
```

安装状态以 `~/Library/LaunchAgents/ai.qiaomu.music-studio-worker.plist` 与网页「我的创作」中的最近心跳为准。配置或依赖存在不代表已成功生成。

## 恢复与扣费边界

- 相同参考曲与要求在存在未完成任务时去重，最多 10 个待处理任务。
- Suno 使用任务 UUID 作为稳定 `request-id`；提交前保存本地 intent，成功后先保存歌曲 ID，再做下载、歌词、封面和上传。
- 提交结果不确定时不会自动重新生成。先检查 `suno jobs` 和 `~/Documents/Suno/Studio/<job-id>` 找回歌曲。
- 已有歌曲 ID 的失败任务可点「恢复已有歌曲的处理」，复用歌曲，不再次生成。提交前失败可直接重试。
- 网页验证后手动生成的结果，可在暂停任务里粘贴 1–2 个 `https://suno.com/song/...` 链接，点「关联并继续处理」。歌词与风格方案保留在任务详情中；关联只恢复下载、歌词、封面和候选上传。
- 候选音频和封面在发布前要求后台登录，响应不缓存；发布后才允许公开播放。
- 候选以 job ID + clip ID 计算稳定曲库 ID，重复上传不产生重复歌曲。发布接口校验候选归属，重复发布同版幂等。
- 一次生成有 Suno 额度消耗；下载还受账号当前下载额度限制。失败时保留已生成歌曲链接，不绕过平台下载权限。

## 验证

```bash
npm ci --legacy-peer-deps
npm test
npm run check
npm run build
python3 -m py_compile scripts/studio-worker.py
```

测试覆盖解析隔离、部分页面拒绝、时区边界、缓存容错、偏好持久化、并发去重、过期执行权、恢复防重扣、HTTP 权限、强制草稿、幂等上传、发布和 Range 音频响应。测试使用临时数据目录，不读取生产歌曲或消耗 Suno 额度。

## 部署与回退

保持现有 Node/systemd 部署。部署 `server.js` 时必须同时部署 `lib/`；同步构建好的 `dist/`。不要覆盖 `data/`、`.env` 或删除旧音频。更新前备份运行代码和元数据，保留旧静态资源以兼容尚未刷新的页面。健康检查 `/health`，公开曲库 `/api/public`，后台工作台 `/api/studio`。

回退服务代码时停用本机执行器，恢复备份的 server/lib/dist，重启同一 systemd 服务；保留所有新增歌曲及任务文件供恢复，不回滚覆盖真实用户数据。
