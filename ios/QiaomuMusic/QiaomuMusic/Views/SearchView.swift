import SwiftUI

struct SearchView: View {
    @EnvironmentObject private var player: MusicPlayer
    @Binding var selectedTab: Int
    @State private var query = ""

    private var results: [PublicTrack] {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !term.isEmpty else { return player.tracks }
        return player.tracks.filter { track in
            [track.title, track.artist, track.album, track.source]
                .joined(separator: " ")
                .lowercased()
                .contains(term)
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    searchField
                    quickPicks
                    resultList
                }
                .padding(.horizontal, 20)
                .padding(.top, 10)
                .padding(.bottom, 112)
            }
            .scrollIndicators(.hidden)
            .navigationTitle("搜索")
        }
    }

    private var searchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            TextField("歌曲、专辑、来源", text: $query)
                .textInputAutocapitalization(.never)
                .submitLabel(.search)
            if !query.isEmpty {
                Button {
                    query = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.horizontal, 14)
        .frame(height: 48)
        .background(Color.qmSurface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var quickPicks: some View {
        let sources = Array(Set(player.tracks.map(\.source).filter { !$0.isEmpty })).sorted()
        return VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: "快速筛选", subtitle: "\(sources.count) 类")
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 132), spacing: 12)], spacing: 12) {
                ForEach(sources, id: \.self) { source in
                    Button {
                        query = source
                    } label: {
                        HStack {
                            Image(systemName: "sparkles")
                                .foregroundStyle(Color.qmGold)
                            Text(source)
                                .font(.callout.weight(.bold))
                                .lineLimit(1)
                            Spacer()
                        }
                        .padding(14)
                        .background(Color.qmSurface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var resultList: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: query.isEmpty ? "全部歌曲" : "搜索结果", subtitle: "\(results.count) 首")
            LazyVStack(spacing: 10) {
                ForEach(results) { track in
                    TrackRow(track: track, isActive: player.activeTrack?.id == track.id, isPlaying: player.isPlaying) {
                        player.play(track)
                        selectedTab = 2
                    }
                }
            }
        }
    }
}
