import SwiftUI

struct LibraryView: View {
    @EnvironmentObject private var player: MusicPlayer
    @Binding var showingSettings: Bool
    @Binding var showingNowPlaying: Bool
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
                ArtworkView(
                    track: player.activeTrack,
                    localCoverURL: player.localCoverURL(for: player.activeTrack),
                    size: 94,
                    cornerRadius: 16
                )
            }

            HStack(spacing: 12) {
                Button {
                    if let track = player.activeTrack ?? player.tracks.first {
                        player.play(track)
                        showingNowPlaying = true
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
                    showingNowPlaying = true
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
                    TrackRow(
                        track: track,
                        isActive: player.activeTrack?.id == track.id,
                        isPlaying: player.isPlaying,
                        isCached: player.isCached(track),
                        localCoverURL: player.localCoverURL(for: track)
                    ) {
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
                                showingNowPlaying = true
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

struct MusicLibraryView: View {
    @EnvironmentObject private var player: MusicPlayer
    @Binding var showingNowPlaying: Bool
    @State private var selectedSection: MusicLibrarySection = .songs

    private var downloadedTracks: [PublicTrack] {
        player.tracks.filter { player.isCached($0) }
    }

    private var albumGroups: [MusicLibraryGroup] {
        groups(by: \.album, fallback: "未归入专辑")
    }

    private var artistGroups: [MusicLibraryGroup] {
        groups(by: \.artist, fallback: "未知艺人")
    }

    private var sourceGroups: [MusicLibraryGroup] {
        groups(by: \.source, fallback: "未知来源")
    }

    private var categories: [MusicLibraryCategory] {
        [
            MusicLibraryCategory(section: .songs, title: "歌曲", icon: "music.note", count: player.tracks.count),
            MusicLibraryCategory(section: .artists, title: "艺人", icon: "music.mic", count: artistGroups.count),
            MusicLibraryCategory(section: .albums, title: "专辑", icon: "square.stack", count: albumGroups.count),
            MusicLibraryCategory(section: .sources, title: "来源", icon: "antenna.radiowaves.left.and.right", count: sourceGroups.count),
            MusicLibraryCategory(section: .downloaded, title: "已下载", icon: "arrow.down.circle", count: downloadedTracks.count)
        ]
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    categoryList
                    selectedContent
                }
                .padding(.horizontal, 20)
                .padding(.top, 10)
                .padding(.bottom, 112)
            }
            .scrollIndicators(.hidden)
            .navigationTitle("资料库")
        }
    }

    private var categoryList: some View {
        VStack(spacing: 0) {
            ForEach(Array(categories.enumerated()), id: \.element.id) { index, category in
                Button {
                    selectedSection = category.section
                } label: {
                    LibraryCategoryRow(category: category, isSelected: selectedSection == category.section)
                }
                .buttonStyle(.plain)

                if index < categories.count - 1 {
                    Divider()
                        .overlay(Color.white.opacity(0.08))
                        .padding(.leading, 54)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 6)
        .background(Color.qmSurface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(Color.white.opacity(0.08))
        )
    }

    @ViewBuilder
    private var selectedContent: some View {
        switch selectedSection {
        case .songs:
            trackList(title: "歌曲", tracks: player.tracks, emptyText: "还没有同步到歌曲。")
        case .downloaded:
            trackList(title: "已下载", tracks: downloadedTracks, emptyText: "播放过的歌曲会自动缓存，之后可离线播放。")
        case .albums:
            groupList(title: "专辑", groups: albumGroups)
        case .artists:
            groupList(title: "艺人", groups: artistGroups)
        case .sources:
            groupList(title: "来源", groups: sourceGroups)
        }
    }

    private func trackList(title: String, tracks: [PublicTrack], emptyText: String) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeader(title: title, subtitle: "\(tracks.count) 首")
            if tracks.isEmpty {
                EmptyLibraryState(text: emptyText)
            } else {
                LazyVStack(spacing: 10) {
                    ForEach(tracks) { track in
                        TrackRow(
                            track: track,
                            isActive: player.activeTrack?.id == track.id,
                            isPlaying: player.isPlaying,
                            isCached: player.isCached(track),
                            localCoverURL: player.localCoverURL(for: track)
                        ) {
                            player.play(track)
                        }
                    }
                }
            }
        }
    }

    private func groupList(title: String, groups: [MusicLibraryGroup]) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeader(title: title, subtitle: "\(groups.count) 组")
            if groups.isEmpty {
                EmptyLibraryState(text: "还没有可归类的内容。")
            } else {
                LazyVStack(spacing: 10) {
                    ForEach(groups) { group in
                        LibraryGroupRow(group: group) {
                            if let first = group.tracks.first {
                                player.play(first)
                                showingNowPlaying = true
                            }
                        }
                    }
                }
            }
        }
    }

    private func groups(by keyPath: KeyPath<PublicTrack, String>, fallback: String) -> [MusicLibraryGroup] {
        Dictionary(grouping: player.tracks) { track in
            let value = track[keyPath: keyPath].trimmingCharacters(in: .whitespacesAndNewlines)
            return value.isEmpty ? fallback : value
        }
        .map { key, tracks in
            MusicLibraryGroup(id: key, title: key, tracks: tracks)
        }
        .sorted { $0.title.localizedCompare($1.title) == .orderedAscending }
    }
}

private enum MusicLibrarySection: String, Identifiable {
    case songs
    case artists
    case albums
    case sources
    case downloaded

    var id: String { rawValue }
}

private struct MusicLibraryCategory: Identifiable {
    let section: MusicLibrarySection
    let title: String
    let icon: String
    let count: Int

    var id: MusicLibrarySection { section }
}

private struct MusicLibraryGroup: Identifiable {
    let id: String
    let title: String
    let tracks: [PublicTrack]
}

private struct LibraryCategoryRow: View {
    let category: MusicLibraryCategory
    let isSelected: Bool

    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: category.icon)
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(isSelected ? Color.qmAccent : Color.qmAccent.opacity(0.82))
                .frame(width: 34, height: 42)

            Text(category.title)
                .font(.title3.weight(.semibold))
                .foregroundStyle(.primary)
                .lineLimit(1)

            Spacer()

            Text("\(category.count)")
                .font(.callout.weight(.semibold))
                .foregroundStyle(.secondary)

            Image(systemName: "chevron.right")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }
}

private struct LibraryGroupRow: View {
    let group: MusicLibraryGroup
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 13) {
                ArtworkView(track: group.tracks.first, size: 58, cornerRadius: 12)
                VStack(alignment: .leading, spacing: 4) {
                    Text(group.title)
                        .font(.headline)
                        .lineLimit(1)
                    Text("\(group.tracks.count) 首")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "play.fill")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.secondary)
                    .frame(width: 30, height: 30)
                    .background(Color.white.opacity(0.06), in: Circle())
            }
            .padding(10)
            .background(Color.qmSurface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(Color.white.opacity(0.06))
            )
        }
        .buttonStyle(.plain)
    }
}

private struct EmptyLibraryState: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.callout.weight(.medium))
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Color.qmSurface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}
