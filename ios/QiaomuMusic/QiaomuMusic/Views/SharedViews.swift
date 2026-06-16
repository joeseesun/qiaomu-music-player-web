import SwiftUI

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
    let track: PublicTrack?
    let size: CGFloat
    let cornerRadius: CGFloat

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

            if let url = track?.coverURL {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    case .failure:
                        placeholder
                    case .empty:
                        ProgressView()
                            .tint(.white)
                    @unknown default:
                        placeholder
                    }
                }
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

struct TrackRow: View {
    let track: PublicTrack
    let isActive: Bool
    let isPlaying: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 13) {
                ArtworkView(track: track, size: 58, cornerRadius: 12)
                VStack(alignment: .leading, spacing: 4) {
                    Text(track.title)
                        .font(.headline)
                        .foregroundStyle(isActive ? Color.qmAccent : Color.primary)
                        .lineLimit(1)
                    Text([track.artist, track.album, track.source].filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                Image(systemName: isActive && isPlaying ? "waveform" : "play.fill")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(isActive ? Color.qmAccent : Color.secondary)
                    .frame(width: 30, height: 30)
                    .background(Color.white.opacity(isActive ? 0.12 : 0.06), in: Circle())
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
    @Binding var selectedTab: Int

    var body: some View {
        Button {
            selectedTab = 2
        } label: {
            HStack(spacing: 12) {
                ArtworkView(track: player.activeTrack, size: 46, cornerRadius: 10)
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
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .strokeBorder(Color.white.opacity(0.16))
            )
        }
        .buttonStyle(.plain)
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
