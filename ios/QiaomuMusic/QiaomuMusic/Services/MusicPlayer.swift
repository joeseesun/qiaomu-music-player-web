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
    private let player = AVPlayer()
    private var timeObserver: Any?
    private var itemEndObserver: NSObjectProtocol?

    init() {
        baseURLString = UserDefaults.standard.string(forKey: Self.baseURLKey) ?? Self.productionBaseURL
        player.volume = Float(volume)
        configureAudioSession()
        installTimeObserver()
        installEndObserver()
        installRemoteCommands()
    }

    deinit {
        if let timeObserver {
            player.removeTimeObserver(timeObserver)
        }
        if let itemEndObserver {
            NotificationCenter.default.removeObserver(itemEndObserver)
        }
    }

    func loadCatalog() async {
        isLoading = true
        status = nil
        do {
            let api = QiaomuMusicAPI(baseURLString: baseURLString)
            let nextTracks = try await api.fetchTracks()
            tracks = nextTracks
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
            status = nextTracks.isEmpty ? "当前站点还没有已发布歌曲。" : nil
        } catch {
            status = error.localizedDescription
        }
        isLoading = false
    }

    func setBaseURL(_ value: String) async {
        baseURLString = value.trimmingCharacters(in: .whitespacesAndNewlines)
        stop()
        tracks = []
        activeTrack = nil
        lyricLines = []
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
        Task {
            await loadLyrics(for: track)
        }
    }

    private func loadLyrics(for track: PublicTrack) async {
        do {
            let api = QiaomuMusicAPI(baseURLString: baseURLString)
            let detail = try? await api.fetchTrackDetail(track)
            let lines = try await api.fetchLyrics(for: detail ?? track)
            if activeTrack?.id == track.id {
                lyricLines = lines
            }
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
        let item = AVPlayerItem(url: audioURL)
        player.replaceCurrentItem(with: item)
        player.volume = Float(volume)
        updateNowPlayingInfo()
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
