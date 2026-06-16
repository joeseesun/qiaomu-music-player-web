import SwiftUI

struct RootView: View {
    @EnvironmentObject private var player: MusicPlayer
    @State private var selectedTab = 0
    @State private var showingSettings = false

    var body: some View {
        ZStack {
            AppBackground()
            TabView(selection: $selectedTab) {
                LibraryView(showingSettings: $showingSettings, selectedTab: $selectedTab)
                    .tabItem {
                        Label("资料库", systemImage: "music.note.list")
                    }
                    .tag(0)

                SearchView(selectedTab: $selectedTab)
                    .tabItem {
                        Label("搜索", systemImage: "magnifyingglass")
                    }
                    .tag(1)

                NowPlayingView()
                    .tabItem {
                        Label("播放", systemImage: "play.circle.fill")
                    }
                    .tag(2)
            }
            .tint(Color.qmAccent)
            .preferredColorScheme(.dark)
        }
        .safeAreaInset(edge: .bottom) {
            if selectedTab != 2, player.activeTrack != nil {
                MiniPlayer(selectedTab: $selectedTab)
                    .padding(.horizontal, 14)
                    .padding(.bottom, 6)
            }
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView()
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .task {
            if player.tracks.isEmpty {
                await player.loadCatalog()
            }
        }
    }
}

struct AppBackground: View {
    var body: some View {
        LinearGradient(
            colors: [
                Color(red: 0.05, green: 0.05, blue: 0.055),
                Color(red: 0.11, green: 0.07, blue: 0.075),
                Color(red: 0.04, green: 0.06, blue: 0.075)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }
}

extension Color {
    static let qmAccent = Color(red: 1.0, green: 0.23, blue: 0.34)
    static let qmGold = Color(red: 0.92, green: 0.70, blue: 0.38)
    static let qmCyan = Color(red: 0.42, green: 0.78, blue: 0.86)
    static let qmSurface = Color.white.opacity(0.075)
    static let qmSurfaceStrong = Color.white.opacity(0.13)
}
