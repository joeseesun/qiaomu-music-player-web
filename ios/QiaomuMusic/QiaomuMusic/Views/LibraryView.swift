import SwiftUI

struct LibraryView: View {
    @EnvironmentObject private var player: MusicPlayer
    @Binding var showingSettings: Bool
    @Binding var selectedTab: Int
    @State private var selectedFilter = "全部"

    private var filters: [String] {
        let albums = Set(player.tracks.map(\.album).filter { !$0.isEmpty })
        let sources = Set(player.tracks.map(\.source).filter { !$0.isEmpty })
        return ["全部"] + Array(albums.union(sources)).sorted()
    }

    private var filteredTracks: [PublicTrack] {
        guard selectedFilter != "全部" else { return player.tracks }
        return player.tracks.filter { $0.album == selectedFilter || $0.source == selectedFilter }
    }

    private var recentTracks: [PublicTrack] {
        filteredTracks.sorted {
            ($0.createdDate ?? .distantPast) > ($1.createdDate ?? .distantPast)
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    hero
                    filterRail
                    latestSection
                    albumSection
                }
                .padding(.horizontal, 20)
                .padding(.top, 10)
                .padding(.bottom, 112)
            }
            .scrollIndicators(.hidden)
            .navigationTitle("乔木音乐")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        Task { await player.loadCatalog() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .disabled(player.isLoading)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                    }
                }
            }
        }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Qiaomu Radio")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.qmGold)
                    Text(player.activeTrack?.title ?? "AI 音乐电台")
                        .font(.system(size: 36, weight: .black, design: .rounded))
                        .lineLimit(2)
                        .minimumScaleFactor(0.72)
                    Text("\(player.tracks.count) 首已发布歌曲 · \(URL(string: player.baseURLString)?.host ?? "music.qiaomu.ai")")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 18)
                ArtworkView(track: player.activeTrack, size: 94, cornerRadius: 16)
            }

            HStack(spacing: 12) {
                Button {
                    if let track = player.activeTrack ?? player.tracks.first {
                        player.play(track)
                        selectedTab = 2
                    }
                } label: {
                    Label(player.isPlaying ? "正在播放" : "播放", systemImage: player.isPlaying ? "waveform" : "play.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(PrimaryCapsuleButtonStyle())
                .disabled(player.tracks.isEmpty)

                Button {
                    player.shuffleEnabled = true
                    player.next()
                    selectedTab = 2
                } label: {
                    Image(systemName: "shuffle")
                        .frame(width: 48, height: 48)
                }
                .buttonStyle(GlassIconButtonStyle())
                .disabled(player.tracks.isEmpty)
            }

            if let status = player.status {
                Text(status)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.qmGold)
            }
        }
        .padding(20)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .strokeBorder(Color.white.opacity(0.12))
        )
    }

    private var filterRail: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 10) {
                ForEach(filters, id: \.self) { filter in
                    Button {
                        selectedFilter = filter
                    } label: {
                        Text(filter)
                            .font(.callout.weight(.semibold))
                            .padding(.horizontal, 16)
                            .padding(.vertical, 9)
                    }
                    .foregroundStyle(filter == selectedFilter ? Color.black : Color.primary)
                    .background(filter == selectedFilter ? Color.qmAccent : Color.qmSurface, in: Capsule())
                }
            }
            .padding(.vertical, 2)
        }
        .scrollIndicators(.hidden)
    }

    private var latestSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeader(title: "最新歌曲", subtitle: "\(recentTracks.count) 首")
            LazyVStack(spacing: 10) {
                ForEach(recentTracks) { track in
                    TrackRow(track: track, isActive: player.activeTrack?.id == track.id, isPlaying: player.isPlaying) {
                        player.play(track)
                    }
                }
            }
        }
    }

    private var albumSection: some View {
        let albums = Dictionary(grouping: player.tracks, by: \.album)
            .map { (album: $0.key, tracks: $0.value) }
            .sorted { $0.album.localizedCompare($1.album) == .orderedAscending }

        return VStack(alignment: .leading, spacing: 14) {
            SectionHeader(title: "专辑与电台", subtitle: "\(albums.count) 组")
            ScrollView(.horizontal) {
                HStack(spacing: 14) {
                    ForEach(albums, id: \.album) { group in
                        AlbumTile(album: group.album, tracks: group.tracks) {
                            if let first = group.tracks.first {
                                player.play(first)
                                selectedTab = 2
                            }
                        }
                    }
                }
                .padding(.vertical, 4)
            }
            .scrollIndicators(.hidden)
        }
    }
}

struct AlbumTile: View {
    let album: String
    let tracks: [PublicTrack]
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                ZStack {
                    ForEach(Array(tracks.prefix(4).enumerated()), id: \.element.id) { index, track in
                        ArtworkView(track: track, size: 76, cornerRadius: 14)
                            .offset(x: CGFloat(index % 2) * 52, y: CGFloat(index / 2) * 52)
                    }
                }
                .frame(width: 130, height: 130, alignment: .topLeading)

                Text(album)
                    .font(.headline)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Text("\(tracks.count) 首")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
            }
            .frame(width: 156, alignment: .leading)
        }
        .buttonStyle(.plain)
    }
}
