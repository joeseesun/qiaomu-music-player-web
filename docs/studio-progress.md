# Suno 发现与创作工作台

更新：2026-10-27（Asia/Shanghai）

目标：每天 09:00 同步指定两个歌单；在网页试听、选择参考曲；创建有上限且可恢复的生成任务；试听候选后发布到现有乔木音乐。

基线：GitHub `joeseesun/qiaomu-music-player-web` 的 main；生产 server.js 与本地基线 SHA256 相同。生产使用 qiaomu-hostinger 上的 qiaomu-music-player.service，目录 /opt/qiaomu-apps/music-player，端口 3068。保留现有 data、环境变量和歌曲。

范围：沿用现有界面与登录。新增功能不改造全站 SEO/PWA。默认新歌词与风格借鉴，不把他人原词微调后标为原创；发布由用户选择候选触发。未选择参考曲前不消费 Suno 生成额度。

已观察：公开歌单使用 Next Flight unifiedFeed；旧 audio_url 为 forbidden，mediaUrls 提供新的音频流。不能猜测旧 CDN 地址作为下载替代。歌单内容来自外部数据，不能成为执行指令。

验收清单：解析与缓存容错、北京时间调度、去重与顺序、权限与重复提交、任务恢复、电脑/手机界面、真实音频加载、执行器可用性、候选发布、GitHub 和生产回读。

已验证（本地）：

- 两个公开歌单各 22 首，共 44 首；真实 HTML 解析、去重和顺序。
- 8 项自动测试通过：时间边界、同步失败保留、租约与防重复扣费、手动关联结果、权限、草稿媒体保护、幂等上传、发布和 Range 播放。HTTP 发布测试使用隔离夹具，未发布测试音乐到生产。
- TypeScript、Python 编译与生产构建通过；浏览器验证桌面及 390px 手机界面、收藏筛选、创建/取消任务。
- 原曲完整 Suno 页面实际播放成功；官方 embed 对本批新格式音频报格式错误，完整页面禁止嵌入。用户确认第一版原曲跳转 Suno，候选在乔木音乐试听。
- 实际调用 deepseek/deepseek-flash 生成《下班的风》全新中文歌词及风格方案。原曲音频不可解码，明确标记只使用公开风格描述。
- Suno CLI 0.10.1 已登录；HTTP 生成未成功。浏览器提交曾出现 Cloudflare 验证，用户接管后点击创建；随后确认两组共 4 首《下班的风》，额度从 10525 到 10505。不再重复提交，通过已有歌曲 ID 恢复下载处理。
- 旧封面服务实测 403；改为优先使用已目视检查的 Codex 内置生成封面，后台默认复用新歌自己的 Suno 封面。增加 3 项封面恢复测试。

部署证据（2026-10-27 11:40 CST）：

- PR #3 已 merge：`b68dc817cd60cd5801b547e84ace529e2109c2f3`；PR 与 main 的 GitHub CI 均通过。
- `https://music.qiaomu.ai/studio` 返回 200，未登录 `/api/studio` 返回 401，公开曲库保持原有 48 首。
- 服务器自动同步两源各 22 首，`lastScheduleDay=2026-10-27`；生产服务与构建的 server/lib/index SHA256 相同。
- 本机 `ai.qiaomu.music-studio-worker` LaunchAgent 已安装运行，生产 API 已收到 ready 心跳。生成需要本机在线，服务端每日同步独立运行。
- 生产浏览器登录后可查看 44 首歌；390px 截图无横向溢出。
- 备份：服务器 `/opt/qiaomu-backups/music-studio-20261027/before.tgz`（0600，含旧代码及曲库元数据）。部署保留旧静态资源和全部音乐。

候选恢复任务：`90d5ad5c-bc0e-4f23-8d89-0775bd15ba5b`、`7d933683-f7dc-436b-ad8c-ce356ba80f5f`。只处理已有 Suno 歌曲，不再次生成。用户在工作台选择发布；尚未代替用户选择公开版本。

最终候选验收：4 首音频已通过 ffprobe（206.36s, 202.0s, 194.24s, 198.0s），同步 LRC 均通过校验；4 个候选已上传到生产，两个任务均为 review。实际浏览器播放候选从 0 到 4.4 秒、总时长 198 秒，无播放器错误，随后暂停。公开曲库仍保持 48 首，等待用户选择发布。

代理层验收发现并修复：旧 Nginx 在 HTTP/HTTPS 直接 alias 音频目录，绕过 Node 草稿鉴权。已备份到同目录 nginx-before.conf，移除两个直出 location；nginx -t 通过并 reload，音频改经现有应用代理。公网未登录 HTTP/HTTPS 草稿请求均 401，公开音频仍为 206。公网响应未见 CDN 缓存头。进一步关闭该站继承的 Nginx proxy_cache，显式转发 Range / If-Range；登录状态实测草稿返回 206、32 字节、Cache-Control: private, no-store。
