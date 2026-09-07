import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var player: MusicPlayer
    @Environment(\.dismiss) private var dismiss
    @State private var draftBaseURL = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("站点 API") {
                    TextField("Base URL", text: $draftBaseURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()

                    Button("保存并刷新") {
                        Task {
                            await player.setBaseURL(draftBaseURL)
                            dismiss()
                        }
                    }
                    .disabled(draftBaseURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }

                Section("快捷切换") {
                    Button("music.qiaomu.ai") {
                        draftBaseURL = MusicPlayer.productionBaseURL
                    }
                    Button("本机模拟器 127.0.0.1:3068") {
                        draftBaseURL = MusicPlayer.localBaseURL
                    }
                }

                Section("播放") {
                    Toggle("随机播放", isOn: $player.shuffleEnabled)
                    Toggle("单曲循环", isOn: $player.repeatEnabled)
                }

                Section("离线缓存") {
                    Toggle("自动缓存媒体", isOn: $player.automaticCachingEnabled)
                    LabeledContent("音频", value: "\(player.cacheFileCount) 首")
                    LabeledContent("封面", value: "\(player.cacheCoverCount) 张")
                    LabeledContent("歌词", value: "\(player.cacheLyricCount) 份")
                    LabeledContent("占用", value: qmFormatBytes(player.cacheByteCount))
                    Button(role: .destructive) {
                        player.clearAudioCache()
                    } label: {
                        Label("清理缓存", systemImage: "trash")
                    }
                    .disabled(player.cacheFileCount + player.cacheCoverCount + player.cacheLyricCount == 0)
                    if let cacheStatus = player.cacheStatus {
                        Text(cacheStatus)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("当前状态") {
                    LabeledContent("曲库", value: "\(player.tracks.count) 首")
                    LabeledContent("站点", value: player.baseURLString)
                    if let status = player.status {
                        Text(status)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("设置")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("完成") {
                        dismiss()
                    }
                }
            }
            .onAppear {
                draftBaseURL = player.baseURLString
            }
        }
    }
}
