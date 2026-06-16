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
