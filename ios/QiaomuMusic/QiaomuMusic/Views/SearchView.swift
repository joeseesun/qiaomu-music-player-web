import SwiftUI

struct SearchView: View {
    @EnvironmentObject private var player: MusicPlayer
    @Binding var showingNowPlaying: Bool
    @State private var query = ""

    private var trimmedQuery: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var results: [PublicTrack] {
        player.searchTracks(matching: trimmedQuery)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    searchField
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
            TextField("歌名、歌词、专辑、来源", text: $query)
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

    private var resultList: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: query.isEmpty ? "全部歌曲" : "搜索结果", subtitle: "\(results.count) 首")
            LazyVStack(spacing: 10) {
                ForEach(results) { track in
                    TrackRow(
                        track: track,
                        isActive: player.activeTrack?.id == track.id,
                        isPlaying: player.isPlaying,
                        isCached: player.isCached(track),
                        localCoverURL: player.localCoverURL(for: track),
                        detail: searchDetail(for: track)
                    ) {
                        player.play(track)
                        showingNowPlaying = true
                    }
                }
            }
        }
    }

    private func searchDetail(for track: PublicTrack) -> String? {
        guard !trimmedQuery.isEmpty,
              let snippet = player.lyricSnippet(for: track, matching: trimmedQuery) else {
            return nil
        }
        return "歌词：\(snippet)"
    }
}
