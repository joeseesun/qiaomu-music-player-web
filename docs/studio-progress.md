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

回归修复进行中（2026-10-27，分支 fix/suno-browser-continuation）：

- 用户点击 Pulse / Night to Night 的两个任务分别为 ea9bf971-fd8c-4e29-9eb7-00e0eafd7fe9、dbab11e2-4457-4e99-9115-44a7cde2f797；已有《雨越下越要跳》《静音外放》方案，但没有歌曲 ID。Suno 曲库读取未发现这两个标题。
- 原因：CLI 的结构化错误写 stderr，旧 worker 只看 stdout，因此隐藏了 captcha_required。对第一个任务用同一 request-id 做一次有界检查，确认在生成提交前就返回 captcha_required；没有重复创建。第二个任务尚未单独重试。
- 修复代码已完成：识别 stderr 错误；仅在已知提交前验证阻断时接到可见 Ego Lite；自动填表，记录提交意图后最多点击一次 Create；遇到人工操作停止队列；网站新增明确交回控制的“检查生成结果”，该操作绝不点击 Create。
- 当前 12 项 Node + 5 项 Python 测试、TypeScript/语法检查和构建通过；实际填表首次尝试在提交前停止，已修正重复标题输入框的选取和校验，但尚未完成实机复验。不能报告已修好或已上线。
- Ego TaskSpace 83 / p1 当前已 handOff，等待用户明确“继续自动检查”后才能 takeOverTaskSpace(83)。不要新开空间绕过。第一页已填歌词与风格，没有点击创建；本地 browser-state.json phase=opened。重新生成 .qa/browser-submit-check.js 后再试，它目前仍是旧 helper 内容。
- 当前修复未提交、未部署。生产和 LaunchAgent 仍为旧版，两个失败任务保持 blocked。确认真实浏览器续接后再提交 PR、合并、部署，并把 studio-worker.py 与新增 studio-browser.js 一起安装到 ~/.local/share/qiaomu-music-studio/。
- 后续优先复用上述任务及已写方案，不重写歌词、不新建重复任务。若出现验证，让用户手动完成，再只检查已有结果；取得 ID 后恢复下载、字幕、封面和草稿试听。公开曲库仍保留 48 首。

浏览器接续实测更新（2026-10-27）：用户交回 TaskSpace 83 后，用实际 helper 成功填写《雨越下越要跳》的歌词、风格、标题、排除风格，并核对 v6；提交意图落盘后仅点击一次 Create。截图确认 Cloudflare 真人验证框出现，已 handOff 等待用户完成；尚无新候选 ID。重复标题字段改为末个输入框，填表问题已复验通过。当前 17 项回归测试通过，结果恢复和上线回读待继续。

上线回读（2026-10-27 12:40 CST）：

- 修复 PR #5 已合并，main 提交 f551ec5；PR CI 通过。生产 server.js、lib/studio.js、dist/index.html 的 SHA256 与合并后本地构建逐一一致。
- 生产服务 active，/health 200，匿名 /api/studio 401；新增 browser-check 对无效任务返回 409。原有公开曲库 trackCount=48，原先两个 review 任务各 2 首候选保留。
- Pulse 的原任务已迁移为 browserPending=true，明确显示 Cloudflare 验证及结果检查按钮；未新建任务、未再次点击 Create。Night to Night 原任务仍 blocked，等待首个任务验证完成后继续核对恢复。
- 本机两个脚本与仓库逐字一致，LaunchAgent PATH 已补 ~/.local/bin，已重新 bootstrap；生产收到 ready 心跳，消息为“等待你完成 Suno 网页操作，随后点击检查生成结果”。
- 真实已有草稿：匿名音频/封面 401；登录音频 Range 206、32 字节，封面 200；两者 private,no-store。没有发布新的公开歌曲。
- 备份 /opt/qiaomu-backups/music-browser-fix-20261027/before.tgz；本机旧 worker 和 plist 在 ~/Library/Logs/QiaomuMusicStudio/browser-fix-backup/。
- 仍待用户完成 TaskSpace 83 / p1 的真人验证并交回控制；之后通过网站 browser-check 让已安装执行器仅取回结果，验收新歌下载和试听。当前无新歌 ID，不能把填表与点击成功写成歌曲生成成功。禁止重复 Create。TaskSpace 尚未 finish，因为已交给用户。

候选恢复完成（2026-10-27 12:55 CST）：

- 用户完成验证后，Suno 实际出现《雨越下越要跳》两组共 4 首，时间分别为 04:39:18 UTC 与 04:50:25 UTC，歌词及风格均匹配。自动检查按设计拒绝自行关联多组结果；已将最早一组 66aa02d9-7c9b-40f2-973d-61639a7f3455、f28c0fd7-0ef1-42a0-96de-10e0ed8e5ae2 关联回原 Pulse 任务。另一组 cabf3bfe-6381-4744-8863-e011006c7297、1e9d52d0-7370-4495-a0d3-9ab2596570a5 保留在 Suno，未删除、未重复创建。
- 发现真实 Ego Lite CLI 将 console 输出放在 stderr，旧 worker 仅解析 stdout，导致具体“多组同名结果”信息变为通用错误。PR #7 / main 7a0afc4 已合并并安装，改为提取两个流中明确的结果标记；19 项回归测试通过。已安装 worker + 真实 Ego CLI 用已确认 ID 走结果解析验证通过，没有创建或浏览器写操作。LaunchAgent 已重启并收到 ready 心跳。
- Night to Night 的《静音外放》经 CLI 搜索确认不存在后，沿用原 request-id、歌词与风格成功生成一次，得到 02bdc008-a477-42a4-b3ae-1e2e9158b7e1、07e13b37-3406-488f-bd59-edd38db46569，并关联回原任务。没有新建重复工作台任务。
- 两个原任务均为 review，各 2 首新候选；执行器完成下载、ffprobe、同步 LRC、Suno 封面和草稿上传。时长分别为《雨越下越要跳》205.52/191.20 秒，《静音外放》217.60/219.96 秒。
- 真实网站分别点击两首候选 A，播放推进至 2 秒以上、duration 正确、audio.error=null，随后暂停。4 首新草稿登录 Range 均 206、32 字节、private,no-store，匿名均 401。公开曲库仍 48 首，尚未替用户选择公开版本。
- 本次恢复额外更新了 canonical qiaomu-dev-skill/references/ship.md 的后台 CLI 输出流与安装后真实链路验收经验。Ego Lite 提示可升级，本次未升级。
