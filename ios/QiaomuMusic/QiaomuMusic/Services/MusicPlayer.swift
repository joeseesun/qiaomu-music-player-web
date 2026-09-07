import AVFoundation
import Foundation
import MediaPlayer

@MainActor
final class MusicPlayer: ObservableObject {
    static let productionBaseURL = "https://music.qiaomu.ai"
    static let localBaseURL = "http://127.0.0.1:3068"

    @Published var tracks: [PublicTrack] = []
    @Published var activeTrack: PublicTrack?
    @Published var lyricLines: [LyricLine] = []
    @Published var isLoading = false
    @Published var isPlaying = false
    @Published var currentTime: Double = 0
    @Published var duration: Double = 0
    @Published var shuffleEnabled = true
    @Published var repeatEnabled = false
    @Published var automaticCachingEnabled: Bool {
        didSet {
            UserDefaults.standard.set(automaticCachingEnabled, forKey: Self.cacheEnabledKey)
            if automaticCachingEnabled, let activeTrack {
                startCachingIfNeeded(activeTrack)
                startCoverCachingIfNeeded(activeTrack)
            }
            if automaticCachingEnabled {
                startLyricsIndexing(for: tracks)
            } else {
                lyricIndexTask?.cancel()
                lyricIndexTask = nil
            }
        }
    }
    @Published var cachedTrackIDs = Set<String>()
    @Published var cachedCoverTrackIDs = Set<String>()
    @Published var cachedLyricTrackIDs = Set<String>()
    @Published var cacheByteCount: Int64 = 0
    @Published var cacheFileCount = 0
    @Published var cacheCoverCount = 0
    @Published var cacheLyricCount = 0
    @Published var cacheStatus: String?
    @Published private(set) var searchIndex: [String: String] = [:]
    @Published var volume: Double = 0.86 {
        didSet {
            player.volume = Float(volume)
        }
    }
    @Published var status: String?
    @Published var baseURLString: String {
        didSet {
            UserDefaults.standard.set(baseURLString, forKey: Self.baseURLKey)
        }
    }

    private static let baseURLKey = "qiaomuMusicBaseURL"
    private static let cacheEnabledKey = "qiaomuMusicAutomaticCachingEnabled"
    private let player = AVPlayer()
    private let audioCache = AudioCacheStore()
    private var timeObserver: Any?
    private var itemEndObserver: NSObjectProtocol?
    private var cacheTasks: [String: Task<Void, Never>] = [:]
    private var coverCacheTasks: [String: Task<Void, Never>] = [:]
    private var lyricIndexTask: Task<Void, Never>?
    private var localCoverURLsByTrackID: [String: URL] = [:]
    private var lyricTextByTrackID: [String: [String]] = [:]

    init() {
        baseURLString = UserDefaults.standard.string(forKey: Self.baseURLKey) ?? Self.productionBaseURL
        automaticCachingEnabled = (UserDefaults.standard.object(forKey: Self.cacheEnabledKey) as? Bool) ?? true
        player.volume = Float(volume)
        configureAudioSession()
        installTimeObserver()
        installEndObserver()
        installRemoteCommands()
        refreshCacheState()
    }

    deinit {
        if let timeObserver {
            player.removeTimeObserver(timeObserver)
        }
        if let itemEndObserver {
            NotificationCenter.default.removeObserver(itemEndObserver)
        }
        lyricIndexTask?.cancel()
    }

    func loadCatalog() async {
        isLoading = true
        status = nil
        do {
            let api = QiaomuMusicAPI(baseURLString: baseURLString)
            let nextTracks = try await api.fetchTracks()
            try? audioCache.saveCatalog(nextTracks)
            await adoptCatalog(nextTracks)
            status = nextTracks.isEmpty ? "当前站点还没有已发布歌曲。" : nil
        } catch {
            let offlineTracks = (try? audioCache.loadCatalog()) ?? []
            if offlineTracks.isEmpty {
                status = error.localizedDescription
            } else {
                await adoptCatalog(offlineTracks)
                status = "离线模式：显示上次同步的曲库。已缓存歌曲可直接播放。"
            }
        }
        refreshCacheState()
        isLoading = false
    }

    func setBaseURL(_ value: String) async {
        baseURLString = value.trimmingCharacters(in: .whitespacesAndNewlines)
        lyricIndexTask?.cancel()
        lyricIndexTask = nil
        stop()
        tracks = []
        activeTrack = nil
        lyricLines = []
        searchIndex = [:]
        lyricTextByTrackID = [:]
        await loadCatalog()
    }

    func play(_ track: PublicTrack? = nil) {
        if let track, track.id != activeTrack?.id {
            setActiveTrack(track)
        }
        guard let activeTrack else {
            status = "先刷新曲库。"
            return
        }
        guard activeTrack.audioURL != nil else {
            status = QiaomuMusicAPIError.missingAudioURL.localizedDescription
            return
        }
        if player.currentItem == nil {
            preparePlayer(for: activeTrack)
        }
        player.play()
        isPlaying = true
        startCachingIfNeeded(activeTrack)
        startCoverCachingIfNeeded(activeTrack)
        updateNowPlayingInfo()
    }

    func pause() {
        player.pause()
        isPlaying = false
        updateNowPlayingInfo()
    }

    func togglePlayback() {
        isPlaying ? pause() : play()
    }

    func stop() {
        player.pause()
        player.replaceCurrentItem(with: nil)
        cacheTasks.values.forEach { $0.cancel() }
        cacheTasks.removeAll()
        coverCacheTasks.values.forEach { $0.cancel() }
        coverCacheTasks.removeAll()
        isPlaying = false
        currentTime = 0
        duration = 0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    func next() {
        guard !tracks.isEmpty else { return }
        if shuffleEnabled, tracks.count > 1 {
            var candidate = tracks.randomElement()
            while candidate?.id == activeTrack?.id {
                candidate = tracks.randomElement()
            }
            if let candidate {
                play(candidate)
            }
            return
        }
        let currentIndex = tracks.firstIndex(where: { $0.id == activeTrack?.id }) ?? -1
        let nextIndex = (currentIndex + 1 + tracks.count) % tracks.count
        play(tracks[nextIndex])
    }

    func previous() {
        guard !tracks.isEmpty else { return }
        if currentTime > 4 {
            seek(to: 0)
            return
        }
        let currentIndex = tracks.firstIndex(where: { $0.id == activeTrack?.id }) ?? 0
        let previousIndex = (currentIndex - 1 + tracks.count) % tracks.count
        play(tracks[previousIndex])
    }

    func seek(to seconds: Double) {
        guard seconds.isFinite else { return }
        let target = CMTime(seconds: max(0, seconds), preferredTimescale: 600)
        player.seek(to: target, toleranceBefore: .zero, toleranceAfter: .zero)
        currentTime = seconds
        updateNowPlayingInfo()
    }

    func activeLyricIndex() -> Int? {
        guard !lyricLines.isEmpty else { return nil }
        if lyricLines.contains(where: { $0.time != nil }) {
            var active = 0
            for index in lyricLines.indices {
                if let time = lyricLines[index].time, time <= currentTime + 0.08 {
                    active = index
                }
            }
            return active
        }
        guard duration.qm_isFinitePositive else { return 0 }
        let estimate = Int((currentTime / duration) * Double(max(lyricLines.count - 1, 1)))
        return min(max(estimate, 0), lyricLines.count - 1)
    }

    func setActiveTrack(_ track: PublicTrack) {
        activeTrack = track
        currentTime = 0
        duration = 0
        lyricLines = []
        preparePlayer(for: track)
        startCoverCachingIfNeeded(track)
        Task {
            await loadLyrics(for: track)
        }
    }

    func isCached(_ track: PublicTrack) -> Bool {
        cachedTrackIDs.contains(track.id)
    }

    func localCoverURL(for track: PublicTrack?) -> URL? {
        guard let track else { return nil }
        return localCoverURLsByTrackID[track.id]
    }

    func ensureCoverCached(_ track: PublicTrack) {
        startCoverCachingIfNeeded(track)
    }

    func searchTracks(matching query: String) -> [PublicTrack] {
        let terms = Self.normalizedSearchTerms(query)
        guard !terms.isEmpty else { return tracks }
        return tracks.filter { track in
            let text = searchIndex[track.id] ?? fallbackSearchText(for: track)
            return terms.allSatisfy { text.contains($0) }
        }
    }

    func lyricSnippet(for track: PublicTrack, matching query: String) -> String? {
        let terms = Self.normalizedSearchTerms(query)
        guard !terms.isEmpty else { return nil }

        return lyricTextByTrackID[track.id]?.first { line in
            let text = Self.normalizedSearchText(line)
            return terms.contains { text.contains($0) }
        }
    }

    func clearAudioCache() {
        cacheTasks.values.forEach { $0.cancel() }
        cacheTasks.removeAll()
        coverCacheTasks.values.forEach { $0.cancel() }
        coverCacheTasks.removeAll()
        lyricIndexTask?.cancel()
        lyricIndexTask = nil
        do {
            try audioCache.clear()
            cacheStatus = "已清理音频、封面和歌词缓存。"
            refreshCacheState()
            rebuildSearchIndex()
            startLyricsIndexing(for: tracks)
        } catch {
            cacheStatus = "清理失败：\(error.localizedDescription)"
        }
    }

    private func adoptCatalog(_ nextTracks: [PublicTrack]) async {
        tracks = nextTracks
        rebuildSearchIndex()
        if activeTrack == nil {
            activeTrack = nextTracks.first
            if let first = nextTracks.first {
                await loadLyrics(for: first)
            }
        } else if let activeTrack,
                  let refreshed = nextTracks.first(where: { $0.id == activeTrack.id }) {
            self.activeTrack = refreshed
            await loadLyrics(for: refreshed)
        }
        refreshCacheState()
        if let activeTrack {
            startCoverCachingIfNeeded(activeTrack)
        }
        startLyricsIndexing(for: nextTracks)
    }

    private func loadLyrics(for track: PublicTrack) async {
        if let cached = audioCache.cachedLyrics(for: track), !cached.isEmpty {
            if activeTrack?.id == track.id {
                lyricLines = cached
            }
            updateSearchIndex(for: track, preferredLyrics: cached)
            refreshCacheState()
            return
        }

        do {
            let api = QiaomuMusicAPI(baseURLString: baseURLString)
            let detail = try? await api.fetchTrackDetail(track)
            let lines = try await api.fetchLyrics(for: detail ?? track)
            try? audioCache.saveLyrics(lines, for: track)
            if activeTrack?.id == track.id {
                lyricLines = lines
            }
            updateSearchIndex(for: track, preferredLyrics: lines)
            refreshCacheState()
        } catch {
            if activeTrack?.id == track.id {
                lyricLines = []
            }
        }
    }

    private func preparePlayer(for track: PublicTrack) {
        guard let audioURL = track.audioURL else {
            status = QiaomuMusicAPIError.missingAudioURL.localizedDescription
            return
        }
        let cachedURL = audioCache.localURL(for: track)
        let item = AVPlayerItem(url: cachedURL ?? audioURL)
        player.replaceCurrentItem(with: item)
        player.volume = Float(volume)
        cacheStatus = cachedURL == nil ? nil : "离线播放：\(track.title)"
        updateNowPlayingInfo()
    }

    private func startCachingIfNeeded(_ track: PublicTrack) {
        guard automaticCachingEnabled else { return }
        if audioCache.localURL(for: track) != nil {
            refreshCacheState()
            return
        }
        guard cacheTasks[track.id] == nil else { return }

        cacheStatus = "正在缓存：\(track.title)"
        let task = Task { [weak self, audioCache] in
            do {
                _ = try await audioCache.cache(track)
                await MainActor.run {
                    self?.finishCaching(track, error: nil)
                }
            } catch is CancellationError {
                await MainActor.run {
                    self?.cacheTasks[track.id] = nil
                }
            } catch {
                await MainActor.run {
                    self?.finishCaching(track, error: error)
                }
            }
        }
        cacheTasks[track.id] = task
    }

    private func startCoverCachingIfNeeded(_ track: PublicTrack) {
        guard automaticCachingEnabled, track.coverURL != nil else { return }
        if cachedCoverTrackIDs.contains(track.id) {
            return
        }
        guard coverCacheTasks[track.id] == nil else { return }

        let task = Task { [weak self, audioCache] in
            do {
                _ = try await audioCache.cacheCover(track)
                await MainActor.run {
                    self?.coverCacheTasks[track.id] = nil
                    self?.refreshCacheState()
                }
            } catch {
                await MainActor.run {
                    self?.coverCacheTasks[track.id] = nil
                }
            }
        }
        coverCacheTasks[track.id] = task
    }

    private func startLyricsIndexing(for tracks: [PublicTrack]) {
        guard automaticCachingEnabled, !tracks.isEmpty else { return }
        lyricIndexTask?.cancel()

        let baseURLString = baseURLString
        lyricIndexTask = Task(priority: .utility) { [weak self, audioCache] in
            let api = QiaomuMusicAPI(baseURLString: baseURLString)

            for track in tracks {
                guard !Task.isCancelled else { return }

                if let cached = audioCache.cachedLyrics(for: track), !cached.isEmpty {
                    await MainActor.run {
                        self?.updateSearchIndex(for: track, preferredLyrics: cached)
                        self?.cachedLyricTrackIDs.insert(track.id)
                    }
                    continue
                }

                do {
                    let lines = try await api.fetchLyrics(for: track)
                    try? audioCache.saveLyrics(lines, for: track)
                    await MainActor.run {
                        guard self?.tracks.contains(where: { $0.id == track.id }) == true else { return }
                        self?.updateSearchIndex(for: track, preferredLyrics: lines)
                        self?.cachedLyricTrackIDs.insert(track.id)
                    }
                } catch is CancellationError {
                    return
                } catch {
                    continue
                }
            }

            await MainActor.run {
                self?.lyricIndexTask = nil
                self?.refreshCacheState()
            }
        }
    }

    private func finishCaching(_ track: PublicTrack, error: Error?) {
        cacheTasks[track.id] = nil
        refreshCacheState()
        guard activeTrack?.id == track.id else { return }
        if let error {
            cacheStatus = "缓存失败：\(error.localizedDescription)"
        } else {
            cacheStatus = "已离线缓存：\(track.title)"
        }
    }

    private func refreshCacheState() {
        let snapshot = audioCache.snapshot()
        cacheFileCount = snapshot.audioFileCount
        cacheCoverCount = snapshot.coverFileCount
        cacheLyricCount = snapshot.lyricFileCount
        cacheByteCount = snapshot.byteCount
        localCoverURLsByTrackID = audioCache.localCoverURLs(for: tracks)
        cachedTrackIDs = Set(tracks.filter { audioCache.localURL(for: $0) != nil }.map(\.id))
        cachedCoverTrackIDs = Set(localCoverURLsByTrackID.keys)
        cachedLyricTrackIDs = Set(tracks.filter { audioCache.hasCachedLyrics(for: $0) }.map(\.id))
    }

    private func rebuildSearchIndex() {
        var nextIndex: [String: String] = [:]
        var nextLyricText: [String: [String]] = [:]
        for track in tracks {
            let entry = searchEntry(for: track)
            nextIndex[track.id] = entry.searchText
            nextLyricText[track.id] = entry.lyricText
        }
        searchIndex = nextIndex
        lyricTextByTrackID = nextLyricText
    }

    private func updateSearchIndex(for track: PublicTrack, preferredLyrics: [LyricLine]) {
        let entry = searchEntry(for: track, preferredLyrics: preferredLyrics)
        searchIndex[track.id] = entry.searchText
        lyricTextByTrackID[track.id] = entry.lyricText
    }

    private func searchEntry(
        for track: PublicTrack,
        preferredLyrics: [LyricLine]? = nil,
        includeCachedLyrics: Bool = false
    ) -> (searchText: String, lyricText: [String]) {
        let lyricText = lyricSearchText(
            for: track,
            preferredLyrics: preferredLyrics,
            includeCachedLyrics: includeCachedLyrics
        )
        let components = [
            track.title,
            track.artist,
            track.album,
            track.source,
            track.lyrics ?? "",
            lyricText.joined(separator: " ")
        ]
        return (Self.normalizedSearchText(components.joined(separator: " ")), lyricText)
    }

    private func lyricSearchText(
        for track: PublicTrack,
        preferredLyrics: [LyricLine]? = nil,
        includeCachedLyrics: Bool = false
    ) -> [String] {
        var values: [String] = []
        values.append(contentsOf: track.lyricLines?.map(\.text) ?? [])
        values.append(contentsOf: track.lyrics?.components(separatedBy: .newlines) ?? [])
        if activeTrack?.id == track.id, !lyricLines.isEmpty {
            values.append(contentsOf: lyricLines.map(\.text))
        }
        if let preferredLyrics {
            values.append(contentsOf: preferredLyrics.map(\.text))
        } else if includeCachedLyrics {
            values.append(contentsOf: audioCache.cachedLyrics(for: track)?.map(\.text) ?? [])
        }
        return uniqueNonEmpty(values)
    }

    private func uniqueNonEmpty(_ values: [String]) -> [String] {
        var seen = Set<String>()
        return values.compactMap { value in
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return nil }
            let key = Self.normalizedSearchText(trimmed)
            guard !seen.contains(key) else { return nil }
            seen.insert(key)
            return trimmed
        }
    }

    private func fallbackSearchText(for track: PublicTrack) -> String {
        Self.normalizedSearchText([track.title, track.artist, track.album, track.source].joined(separator: " "))
    }

    private static func normalizedSearchTerms(_ value: String) -> [String] {
        let normalized = normalizedSearchText(value.trimmingCharacters(in: .whitespacesAndNewlines))
        return normalized
            .split(whereSeparator: { $0.isWhitespace || $0.isNewline })
            .map(String.init)
    }

    private static func normalizedSearchText(_ value: String) -> String {
        value
            .folding(options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive], locale: .current)
            .lowercased()
    }

    private func configureAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            status = "音频会话初始化失败：\(error.localizedDescription)"
        }
    }

    private func installTimeObserver() {
        let interval = CMTime(seconds: 0.25, preferredTimescale: 600)
        timeObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            guard let self else { return }
            Task { @MainActor in
                self.currentTime = time.seconds.isFinite ? time.seconds : 0
                if let itemDuration = self.player.currentItem?.duration.seconds, itemDuration.qm_isFinitePositive {
                    self.duration = itemDuration
                }
                self.updateNowPlayingInfo()
            }
        }
    }

    private func installEndObserver() {
        itemEndObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                if self.repeatEnabled {
                    self.seek(to: 0)
                    self.play()
                } else {
                    self.next()
                }
            }
        }
    }

    private func installRemoteCommands() {
        let commandCenter = MPRemoteCommandCenter.shared()
        commandCenter.playCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.play() }
            return .success
        }
        commandCenter.pauseCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.pause() }
            return .success
        }
        commandCenter.nextTrackCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.next() }
            return .success
        }
        commandCenter.previousTrackCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.previous() }
            return .success
        }
        commandCenter.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            Task { @MainActor in self?.seek(to: event.positionTime) }
            return .success
        }
    }

    private func updateNowPlayingInfo() {
        guard let activeTrack else { return }
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: activeTrack.title,
            MPMediaItemPropertyArtist: activeTrack.artist,
            MPMediaItemPropertyAlbumTitle: activeTrack.album,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: currentTime,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1 : 0
        ]
        if duration.qm_isFinitePositive {
            info[MPMediaItemPropertyPlaybackDuration] = duration
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
}
