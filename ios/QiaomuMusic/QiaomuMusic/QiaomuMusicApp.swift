import SwiftUI

@main
struct QiaomuMusicApp: App {
    @StateObject private var player = MusicPlayer()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(player)
        }
    }
}
