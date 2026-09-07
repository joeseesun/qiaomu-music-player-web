import Foundation

struct AudioCacheSnapshot: Equatable {
    let audioFileCount: Int
    let coverFileCount: Int
    let lyricFileCount: Int
    let byteCount: Int64

    var fileCount: Int {
        audioFileCount + coverFileCount + lyricFileCount
    }
}

enum AudioCacheError: LocalizedError {
    case missingAudioURL
    case missingCoverURL
    case badResponse(Int)

    var errorDescription: String? {
        switch self {
        case .missingAudioURL:
            return "这首歌没有可缓存的音频地址。"
        case .missingCoverURL:
            return "这首歌没有可缓存的封面地址。"
        case .badResponse(let status):
            return "媒体下载返回 HTTP \(status)。"
        }
    }
}

final class AudioCacheStore {
    private let fileManager: FileManager
    private let cacheRoot: URL
    private let audioDirectory: URL
    private let coverDirectory: URL
    private let lyricsDirectory: URL
    private let catalogDirectory: URL
    private let catalogURL: URL

    init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
        let cachesRoot = Self.directory(.cachesDirectory, fileManager: fileManager)
        cacheRoot = cachesRoot
            .appendingPathComponent("QiaomuMusic", isDirectory: true)
        audioDirectory = cacheRoot.appendingPathComponent("AudioCache", isDirectory: true)
        coverDirectory = cacheRoot.appendingPathComponent("CoverCache", isDirectory: true)
        lyricsDirectory = cacheRoot.appendingPathComponent("LyricsCache", isDirectory: true)

        catalogDirectory = Self.directory(.applicationSupportDirectory, fileManager: fileManager)
            .appendingPathComponent("QiaomuMusic", isDirectory: true)
        catalogURL = catalogDirectory.appendingPathComponent("catalog.json")
    }

    func localURL(for track: PublicTrack) -> URL? {
        let url = fileURL(for: track)
        guard fileManager.fileExists(atPath: url.path),
              ((try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) > 0 else {
            return nil
        }
        return url
    }

    func localCoverURL(for track: PublicTrack) -> URL? {
        guard let url = firstExistingFile(in: coverDirectory, baseName: safeFileName(for: track)) else {
            return nil
        }
        return url
    }

    func localCoverURLs(for tracks: [PublicTrack]) -> [String: URL] {
        let files = regularFiles(in: coverDirectory)
        var filesByBaseName: [String: URL] = [:]
        for file in files {
            filesByBaseName[file.deletingPathExtension().lastPathComponent] = file
        }

        return Dictionary(uniqueKeysWithValues: tracks.compactMap { track in
            guard let url = filesByBaseName[safeFileName(for: track)] else { return nil }
            return (track.id, url)
        })
    }

    func hasCachedLyrics(for track: PublicTrack) -> Bool {
        regularFileExists(at: lyricsURL(for: track))
    }

    func cachedLyrics(for track: PublicTrack) -> [LyricLine]? {
        let url = lyricsURL(for: track)
        guard let data = try? Data(contentsOf: url) else {
            return nil
        }
        return try? JSONDecoder().decode([LyricLine].self, from: data)
    }

    func cache(_ track: PublicTrack) async throws -> URL {
        if let cached = localURL(for: track) {
            return cached
        }
        guard let remoteURL = track.audioURL else {
            throw AudioCacheError.missingAudioURL
        }

        try fileManager.createDirectory(at: audioDirectory, withIntermediateDirectories: true)
        let destinationURL = fileURL(for: track)
        let (temporaryURL, response) = try await URLSession.shared.download(from: remoteURL)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw AudioCacheError.badResponse(http.statusCode)
        }
        try Task.checkCancellation()

        if fileManager.fileExists(atPath: destinationURL.path) {
            try fileManager.removeItem(at: destinationURL)
        }
        try fileManager.moveItem(at: temporaryURL, to: destinationURL)
        return destinationURL
    }

    func cacheCover(_ track: PublicTrack) async throws -> URL? {
        if let cached = localCoverURL(for: track) {
            return cached
        }
        guard let remoteURL = track.coverURL else {
            return nil
        }

        try fileManager.createDirectory(at: coverDirectory, withIntermediateDirectories: true)
        let (temporaryURL, response) = try await URLSession.shared.download(from: remoteURL)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw AudioCacheError.badResponse(http.statusCode)
        }
        try Task.checkCancellation()

        let extensionFromResponse = Self.fileExtension(from: response.mimeType)
        let destinationURL = coverDirectory.appendingPathComponent(
            "\(safeFileName(for: track)).\(track.coverURL?.pathExtension.nonEmpty ?? extensionFromResponse ?? "image")"
        )
        removeExistingFiles(in: coverDirectory, baseName: safeFileName(for: track))
        try fileManager.moveItem(at: temporaryURL, to: destinationURL)
        return destinationURL
    }

    func saveLyrics(_ lines: [LyricLine], for track: PublicTrack) throws {
        try fileManager.createDirectory(at: lyricsDirectory, withIntermediateDirectories: true)
        let data = try JSONEncoder().encode(lines)
        try data.write(to: lyricsURL(for: track), options: [.atomic])
    }

    func snapshot() -> AudioCacheSnapshot {
        let audio = directorySnapshot(audioDirectory)
        let covers = directorySnapshot(coverDirectory)
        let lyrics = directorySnapshot(lyricsDirectory)
        return AudioCacheSnapshot(
            audioFileCount: audio.fileCount,
            coverFileCount: covers.fileCount,
            lyricFileCount: lyrics.fileCount,
            byteCount: audio.byteCount + covers.byteCount + lyrics.byteCount
        )
    }

    func clear() throws {
        if fileManager.fileExists(atPath: cacheRoot.path) {
            try fileManager.removeItem(at: cacheRoot)
        }
        try fileManager.createDirectory(at: audioDirectory, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: coverDirectory, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: lyricsDirectory, withIntermediateDirectories: true)
    }

    func saveCatalog(_ tracks: [PublicTrack]) throws {
        try fileManager.createDirectory(at: catalogDirectory, withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(tracks)
        try data.write(to: catalogURL, options: [.atomic])
    }

    func loadCatalog() throws -> [PublicTrack] {
        let data = try Data(contentsOf: catalogURL)
        return try JSONDecoder().decode([PublicTrack].self, from: data)
    }

    private func directorySnapshot(_ directory: URL) -> (fileCount: Int, byteCount: Int64) {
        var byteCount: Int64 = 0
        var fileCount = 0
        for file in regularFiles(in: directory) {
            let values = try? file.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
            fileCount += 1
            byteCount += Int64(values?.fileSize ?? 0)
        }
        return (fileCount, byteCount)
    }

    private func fileURL(for track: PublicTrack) -> URL {
        audioDirectory.appendingPathComponent("\(safeFileName(for: track)).\(fileExtension(for: track))")
    }

    private func safeFileName(for track: PublicTrack) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_."))
        let scalars = track.id.unicodeScalars.map { scalar in
            allowed.contains(scalar) ? String(scalar) : "-"
        }
        let name = scalars.joined().trimmingCharacters(in: CharacterSet(charactersIn: "-."))
        return name.isEmpty ? "track" : name
    }

    private func lyricsURL(for track: PublicTrack) -> URL {
        lyricsDirectory.appendingPathComponent("\(safeFileName(for: track)).json")
    }

    private func firstExistingFile(in directory: URL, baseName: String) -> URL? {
        regularFiles(in: directory).first { file in
            guard file.deletingPathExtension().lastPathComponent == baseName else { return false }
            return true
        }
    }

    private func regularFiles(in directory: URL) -> [URL] {
        guard let files = try? fileManager.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: [.isRegularFileKey, .fileSizeKey],
            options: [.skipsHiddenFiles]
        ) else {
            return []
        }
        return files.filter { regularFileExists(at: $0) }
    }

    private func regularFileExists(at url: URL) -> Bool {
        guard fileManager.fileExists(atPath: url.path) else { return false }
        let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
        return values?.isRegularFile == true && ((values?.fileSize ?? 0) > 0)
    }

    private func removeExistingFiles(in directory: URL, baseName: String) {
        guard let files = try? fileManager.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) else {
            return
        }
        files
            .filter { $0.deletingPathExtension().lastPathComponent == baseName }
            .forEach { try? fileManager.removeItem(at: $0) }
    }

    private func fileExtension(for track: PublicTrack) -> String {
        if let pathExtension = track.audioURL?.pathExtension.lowercased(), !pathExtension.isEmpty {
            return pathExtension
        }

        let contentType = track.contentType?.lowercased() ?? ""
        if contentType.contains("mpeg") || contentType.contains("mp3") {
            return "mp3"
        }
        if contentType.contains("mp4") || contentType.contains("m4a") {
            return "m4a"
        }
        if contentType.contains("aac") {
            return "aac"
        }
        if contentType.contains("wav") {
            return "wav"
        }
        if contentType.contains("flac") {
            return "flac"
        }
        if contentType.contains("ogg") {
            return "ogg"
        }
        return "audio"
    }

    private static func fileExtension(from mimeType: String?) -> String? {
        guard let mimeType = mimeType?.lowercased() else { return nil }
        if mimeType.contains("jpeg") || mimeType.contains("jpg") {
            return "jpg"
        }
        if mimeType.contains("png") {
            return "png"
        }
        if mimeType.contains("webp") {
            return "webp"
        }
        if mimeType.contains("gif") {
            return "gif"
        }
        return nil
    }

    private static func directory(
        _ directory: FileManager.SearchPathDirectory,
        fileManager: FileManager
    ) -> URL {
        (try? fileManager.url(
            for: directory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )) ?? fileManager.temporaryDirectory
    }
}

private extension String {
    var nonEmpty: String? {
        isEmpty ? nil : self
    }
}
