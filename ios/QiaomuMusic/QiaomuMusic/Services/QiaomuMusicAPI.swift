import Foundation

enum QiaomuMusicAPIError: LocalizedError {
    case invalidBaseURL
    case badResponse(Int)
    case missingAudioURL

    var errorDescription: String? {
        switch self {
        case .invalidBaseURL:
            return "站点地址无效。"
        case .badResponse(let status):
            return "接口返回 HTTP \(status)。"
        case .missingAudioURL:
            return "这首歌没有可播放的音频地址。"
        }
    }
}

struct QiaomuMusicAPI {
    var baseURLString: String
    var session: URLSession = .shared

    func fetchTracks() async throws -> [PublicTrack] {
        let url = try endpoint("/api/public/tracks")
        let response: TrackListResponse = try await request(url)
        return response.tracks
    }

    func fetchTrackDetail(_ track: PublicTrack) async throws -> PublicTrack {
        let url = try endpoint(track.apiUrl ?? "/api/public/tracks/\(track.id)")
        let response: TrackDetailResponse = try await request(url)
        return response.track
    }

    func fetchLyrics(for track: PublicTrack) async throws -> [LyricLine] {
        if let lyricLines = track.lyricLines, !lyricLines.isEmpty {
            return lyricLines
        }
        let fallback = "/api/public/tracks/\(track.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? track.id)/lyrics"
        let url = try endpoint(track.lyricsUrl ?? fallback)
        let response: LyricsResponse = try await request(url)
        return response.lines
    }

    private func request<T: Decodable>(_ url: URL) async throws -> T {
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "accept")
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw QiaomuMusicAPIError.badResponse(-1)
        }
        guard (200..<300).contains(http.statusCode) else {
            throw QiaomuMusicAPIError.badResponse(http.statusCode)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func endpoint(_ path: String) throws -> URL {
        if let absolute = URL(string: path), absolute.scheme != nil {
            return absolute
        }
        let trimmed = baseURLString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw QiaomuMusicAPIError.invalidBaseURL
        }
        let normalized = trimmed.hasSuffix("/") ? trimmed : "\(trimmed)/"
        guard let baseURL = URL(string: normalized) else {
            throw QiaomuMusicAPIError.invalidBaseURL
        }
        let relativePath = path.hasPrefix("/") ? String(path.dropFirst()) : path
        guard let url = URL(string: relativePath, relativeTo: baseURL)?.absoluteURL else {
            throw QiaomuMusicAPIError.invalidBaseURL
        }
        return url
    }
}
