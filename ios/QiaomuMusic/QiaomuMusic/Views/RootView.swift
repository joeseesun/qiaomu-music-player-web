import SwiftUI

struct RootView: View {
    @EnvironmentObject private var player: MusicPlayer
    @State private var selectedTab = 0
    @State private var showingSettings = false
    @State private var showingNowPlaying = false

    var body: some View {
        ZStack {
            AppBackground()
            tabLayout
        }
        .sheet(isPresented: $showingNowPlaying) {
            NowPlayingView()
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
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

    @ViewBuilder
    private var tabLayout: some View {
        if #available(iOS 26.1, *) {
            tabs
                .tabViewBottomAccessory(isEnabled: player.activeTrack != nil) {
                    MiniPlayer(showingNowPlaying: $showingNowPlaying, showsChrome: false)
                        .padding(.horizontal, 14)
                }
        } else {
            ZStack(alignment: .bottom) {
                tabs

                if player.activeTrack != nil {
                    MiniPlayer(showingNowPlaying: $showingNowPlaying)
                        .padding(.horizontal, 14)
                        .padding(.bottom, 56)
                }
            }
        }
    }

    private var tabs: some View {
        TabView(selection: $selectedTab) {
            LibraryView(showingSettings: $showingSettings, showingNowPlaying: $showingNowPlaying)
                .tabItem {
                    Image(systemName: "house.fill")
                        .accessibilityLabel("主页")
                }
                .tag(0)

            MusicLibraryView(showingNowPlaying: $showingNowPlaying)
                .tabItem {
                    Image(systemName: "music.note.list")
                        .accessibilityLabel("资料库")
                }
                .tag(1)

            SearchView(showingNowPlaying: $showingNowPlaying)
                .tabItem {
                    Image(systemName: "magnifyingglass")
                        .accessibilityLabel("搜索")
                }
                .tag(2)
        }
        .tint(Color.qmAccent)
        .toolbarBackground(.visible, for: .tabBar)
        .toolbarBackground(.ultraThinMaterial, for: .tabBar)
        .preferredColorScheme(.dark)
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
