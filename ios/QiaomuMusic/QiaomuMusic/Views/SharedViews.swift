import SwiftUI
import UIKit

private final class CoverImageMemoryCache {
    static let shared = CoverImageMemoryCache()

    private let cache = NSCache<NSString, UIImage>()
    private let lock = NSLock()
    private var inFlightTasks: [String: Task<UIImage?, Never>] = [:]

    private init() {
        cache.countLimit = 160
    }

    func image(for key: String) -> UIImage? {
        cache.object(forKey: key as NSString)
    }

    func set(_ image: UIImage, for key: String) {
        cache.setObject(image, forKey: key as NSString)
    }

    func image(for key: String, aliasKey: String?, loadingFrom url: URL) async -> UIImage? {
        if let image = image(for: key) {
            return image
        }
        if let aliasKey, let image = image(for: aliasKey) {
            return image
        }

        let task = task(for: key, url: url)
        let image = await task.value
        if let image {
            set(image, for: key)
            if let aliasKey {
                set(image, for: aliasKey)
            }
        }

        removeTask(for: key)

        return image
    }

    private func task(for key: String, url: URL) -> Task<UIImage?, Never> {
        lock.lock()
        if let task = inFlightTasks[key] {
            lock.unlock()
            return task
        }

        let task = Task.detached(priority: .utility) { () -> UIImage? in
            guard let data = try? Data(contentsOf: url) else { return nil }
            return UIImage(data: data)
        }
        inFlightTasks[key] = task
        lock.unlock()
        return task
    }

    private func removeTask(for key: String) {
        lock.lock()
        inFlightTasks[key] = nil
        lock.unlock()
    }
}

struct SectionHeader: View {
    let title: String
    let subtitle: String

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.title3.weight(.black))
            Spacer()
            Text(subtitle)
                .font(.caption.weight(.bold))
                .foregroundStyle(.secondary)
        }
    }
}

struct ArtworkView: View {
    @State private var localImage: UIImage?
    @State private var loadedImageKey = ""
    @State private var loadedTrackID = ""

    let track: PublicTrack?
    let localCoverURL: URL?
    let size: CGFloat
    let cornerRadius: CGFloat

    init(track: PublicTrack?, localCoverURL: URL? = nil, size: CGFloat, cornerRadius: CGFloat) {
        self.track = track
        self.localCoverURL = localCoverURL
        self.size = size
        self.cornerRadius = cornerRadius
    }

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [.qmAccent, .qmGold, .qmCyan],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            if let localImage = displayedImage {
                Image(uiImage: localImage)
                    .resizable()
                    .scaledToFill()
            } else {
                placeholder
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .strokeBorder(Color.white.opacity(0.16))
        )
        .transaction { transaction in
            transaction.animation = nil
        }
        .task(id: imageLoadKey) {
            await loadCoverImage()
        }
    }

    private var trackID: String {
        track?.id ?? "empty"
    }

    private var imageURL: URL? {
        localCoverURL ?? track?.coverURL
    }

    private var trackImageKey: String {
        "track|\(trackID)"
    }

    private var displayedImage: UIImage? {
        if loadedImageKey == imageLoadKey, let localImage {
            return localImage
        }
        if let cached = CoverImageMemoryCache.shared.image(for: imageLoadKey) {
            return cached
        }
        if let cached = CoverImageMemoryCache.shared.image(for: trackImageKey) {
            return cached
        }
        if loadedTrackID == trackID, let localImage {
            return localImage
        }
        return nil
    }

    private var imageLoadKey: String {
        if let localCoverURL {
            return "local|\(trackID)|\(localCoverURL.path)"
        }
        if let url = track?.coverURL {
            return "remote|\(trackID)|\(url.absoluteString)"
        }
        return "empty|\(trackID)"
    }

    @MainActor
    private func loadCoverImage() async {
        let key = imageLoadKey
        let nextTrackID = trackID

        guard track != nil else {
            localImage = nil
            loadedImageKey = key
            loadedTrackID = nextTrackID
            return
        }

        guard let url = imageURL else {
            localImage = nil
            loadedImageKey = key
            loadedTrackID = nextTrackID
            return
        }

        if let cached = CoverImageMemoryCache.shared.image(for: key) {
            localImage = cached
            loadedImageKey = key
            loadedTrackID = nextTrackID
            return
        }

        if let cached = CoverImageMemoryCache.shared.image(for: trackImageKey) {
            localImage = cached
            loadedTrackID = nextTrackID
        }

        if loadedTrackID != nextTrackID {
            localImage = nil
            loadedImageKey = ""
        }

        let image = await CoverImageMemoryCache.shared.image(
            for: key,
            aliasKey: trackImageKey,
            loadingFrom: url
        )

        guard !Task.isCancelled, key == imageLoadKey else { return }
        localImage = image
        loadedImageKey = key
        loadedTrackID = nextTrackID
    }

    private var placeholder: some View {
        VStack(spacing: 8) {
            Image(systemName: "music.note")
                .font(.system(size: max(20, size * 0.22), weight: .black))
            Text("QM")
                .font(.system(size: max(16, size * 0.18), weight: .black, design: .rounded))
        }
        .foregroundStyle(.white.opacity(0.9))
    }
}

struct StableArtworkView: View, Equatable {
    let track: PublicTrack?
    let localCoverURL: URL?
    let size: CGFloat
    let cornerRadius: CGFloat

    static func == (lhs: StableArtworkView, rhs: StableArtworkView) -> Bool {
        lhs.track?.id == rhs.track?.id
            && lhs.track?.coverUrl == rhs.track?.coverUrl
            && lhs.localCoverURL == rhs.localCoverURL
            && lhs.size == rhs.size
            && lhs.cornerRadius == rhs.cornerRadius
    }

    var body: some View {
        ArtworkView(track: track, localCoverURL: localCoverURL, size: size, cornerRadius: cornerRadius)
    }
}

struct TrackRow: View {
    let track: PublicTrack
    let isActive: Bool
    let isPlaying: Bool
    let isCached: Bool
    let localCoverURL: URL?
    let detail: String?
    let action: () -> Void

    init(
        track: PublicTrack,
        isActive: Bool,
        isPlaying: Bool,
        isCached: Bool,
        localCoverURL: URL? = nil,
        detail: String? = nil,
        action: @escaping () -> Void
    ) {
        self.track = track
        self.isActive = isActive
        self.isPlaying = isPlaying
        self.isCached = isCached
        self.localCoverURL = localCoverURL
        self.detail = detail
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 13) {
                StableArtworkView(track: track, localCoverURL: localCoverURL, size: 58, cornerRadius: 12)
                    .equatable()
                VStack(alignment: .leading, spacing: 4) {
                    Text(track.title)
                        .font(.headline)
                        .foregroundStyle(isActive ? Color.qmAccent : Color.primary)
                        .lineLimit(1)
                    Text(detail ?? [track.artist, track.album, track.source].filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.caption.weight(.medium))
                        .foregroundStyle(detail == nil ? .secondary : Color.qmGold)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                HStack(spacing: 7) {
                    if isCached {
                        Image(systemName: "arrow.down.circle.fill")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(Color.qmCyan)
                    }
                    Image(systemName: isActive && isPlaying ? "waveform" : "play.fill")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(isActive ? Color.qmAccent : Color.secondary)
                        .frame(width: 30, height: 30)
                        .background(Color.white.opacity(isActive ? 0.12 : 0.06), in: Circle())
                }
            }
            .padding(10)
            .background(isActive ? Color.qmAccent.opacity(0.12) : Color.qmSurface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(Color.white.opacity(isActive ? 0.14 : 0.06))
            )
        }
        .buttonStyle(.plain)
    }
}

struct MiniPlayer: View {
    @EnvironmentObject private var player: MusicPlayer
    @Binding var showingNowPlaying: Bool
    var showsChrome = true

    var body: some View {
        if showsChrome {
            content
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .strokeBorder(Color.white.opacity(0.16))
                )
        } else {
            content
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
        }
    }

    private var content: some View {
        HStack(spacing: 12) {
            Button {
                showingNowPlaying = true
            } label: {
                HStack(spacing: 12) {
                    StableArtworkView(
                        track: player.activeTrack,
                        localCoverURL: player.localCoverURL(for: player.activeTrack),
                        size: showsChrome ? 46 : 42,
                        cornerRadius: 10
                    )
                    .equatable()
                    VStack(alignment: .leading, spacing: 2) {
                        Text(player.activeTrack?.title ?? "乔木音乐")
                            .font(.subheadline.weight(.bold))
                            .lineLimit(1)
                        Text(player.activeTrack?.artist ?? "选择一首歌开始播放")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 8)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Button {
                player.togglePlayback()
            } label: {
                Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 18, weight: .bold))
                    .frame(width: 40, height: 40)
            }
            .buttonStyle(.plain)
            Button {
                player.next()
            } label: {
                Image(systemName: "forward.fill")
                    .font(.system(size: 18, weight: .bold))
                    .frame(width: 34, height: 40)
            }
            .buttonStyle(.plain)
        }
    }
}

struct PrimaryCapsuleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline.weight(.bold))
            .frame(height: 48)
            .foregroundStyle(.black)
            .background(Color.qmAccent.opacity(configuration.isPressed ? 0.74 : 1), in: Capsule())
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}

struct GlassIconButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline.weight(.bold))
            .foregroundStyle(.primary)
            .background(Color.qmSurfaceStrong.opacity(configuration.isPressed ? 0.72 : 1), in: Circle())
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
    }
}
