import SwiftUI

struct NowPlayingView: View {
    @EnvironmentObject private var player: MusicPlayer
    @State private var scrubTime: Double = 0
    @State private var isScrubbing = false

    private var sliderValue: Binding<Double> {
        Binding {
            isScrubbing ? scrubTime : player.currentTime
        } set: { value in
            scrubTime = value
            isScrubbing = true
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    ArtworkView(track: player.activeTrack, size: 312, cornerRadius: 24)
                        .shadow(color: .black.opacity(0.42), radius: 28, y: 20)
                        .padding(.top, 24)

                    VStack(spacing: 6) {
                        Text(player.activeTrack?.title ?? "选择一首歌")
                            .font(.system(size: 28, weight: .black, design: .rounded))
                            .lineLimit(2)
                            .multilineTextAlignment(.center)
                            .minimumScaleFactor(0.7)
                        Text(subtitle)
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    .padding(.horizontal, 22)

                    progress
                    controls
                    lyrics
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 36)
            }
            .scrollIndicators(.hidden)
            .navigationTitle("正在播放")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var subtitle: String {
        guard let track = player.activeTrack else { return "乔木音乐" }
        return [track.artist, track.album, track.source].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private var progress: some View {
        VStack(spacing: 8) {
            Slider(
                value: sliderValue,
                in: 0...max(player.duration, 1),
                onEditingChanged: { editing in
                    if editing {
                        scrubTime = player.currentTime
                        isScrubbing = true
                    } else {
                        player.seek(to: scrubTime)
                        isScrubbing = false
                    }
                }
            )
            .tint(Color.qmAccent)
            .disabled(player.activeTrack == nil)

            HStack {
                Text(qmFormatTime(isScrubbing ? scrubTime : player.currentTime))
                Spacer()
                Text(qmFormatTime(player.duration))
            }
            .font(.caption.monospacedDigit().weight(.semibold))
            .foregroundStyle(.secondary)
        }
    }

    private var controls: some View {
        VStack(spacing: 22) {
            HStack(spacing: 30) {
                Button {
                    player.shuffleEnabled.toggle()
                } label: {
                    Image(systemName: "shuffle")
                }
                .foregroundStyle(player.shuffleEnabled ? Color.qmAccent : Color.secondary)

                Button {
                    player.previous()
                } label: {
                    Image(systemName: "backward.fill")
                }

                Button {
                    player.togglePlayback()
                } label: {
                    Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: 30, weight: .bold))
                        .frame(width: 76, height: 76)
                        .background(Color.primary, in: Circle())
                        .foregroundStyle(Color.black)
                }
                .disabled(player.activeTrack == nil)

                Button {
                    player.next()
                } label: {
                    Image(systemName: "forward.fill")
                }

                Button {
                    player.repeatEnabled.toggle()
                } label: {
                    Image(systemName: player.repeatEnabled ? "repeat.1" : "repeat")
                }
                .foregroundStyle(player.repeatEnabled ? Color.qmAccent : Color.secondary)
            }
            .font(.system(size: 23, weight: .semibold))
            .buttonStyle(.plain)

            HStack(spacing: 12) {
                Image(systemName: "speaker.fill")
                    .foregroundStyle(.secondary)
                Slider(value: $player.volume, in: 0...1)
                    .tint(.white)
                Image(systemName: "speaker.wave.3.fill")
                    .foregroundStyle(.secondary)
            }
            .font(.footnote)
        }
    }

    private var lyrics: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeader(title: "歌词", subtitle: player.lyricLines.isEmpty ? "未提供" : "\(player.lyricLines.count) 行")
            LyricsPanel()
        }
    }
}

struct LyricsPanel: View {
    @EnvironmentObject private var player: MusicPlayer

    var body: some View {
        let activeIndex = player.activeLyricIndex()
        VStack(alignment: .leading, spacing: 0) {
            if player.lyricLines.isEmpty {
                Text("当前歌曲暂无歌词。")
                    .font(.callout.weight(.medium))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(18)
            } else {
                ForEach(Array(player.lyricLines.enumerated()), id: \.element.id) { index, line in
                    Button {
                        if let time = line.time {
                            player.seek(to: time)
                        }
                    } label: {
                        Text(line.text)
                            .font(index == activeIndex ? .title3.weight(.black) : .body.weight(.semibold))
                            .foregroundStyle(index == activeIndex ? Color.primary : Color.secondary)
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 9)
                    }
                    .buttonStyle(.plain)
                    .disabled(line.time == nil)
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 12)
            }
        }
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .strokeBorder(Color.white.opacity(0.1))
        )
    }
}
