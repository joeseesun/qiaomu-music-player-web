import Foundation

struct PublicTrack: Decodable, Identifiable, Equatable {
    let id: String
    let title: String
    let artist: String
    let album: String
    let source: String
    let size: Int?
    let contentType: String?
    let createdAt: String?
    let updatedAt: String?
    let pageUrl: String?
    let audioUrl: String
    let coverUrl: String?
    let apiUrl: String?
    let lyricsUrl: String?
    let embedScriptUrl: String?
    let embedHtml: String?
    let lyrics: String?
    let lyricLines: [LyricLine]?

    var audioURL: URL? {
        URL(string: audioUrl)
    }

    var coverURL: URL? {
        guard let coverUrl, !coverUrl.isEmpty else { return nil }
        return URL(string: coverUrl)
    }

    var createdDate: Date? {
        guard let createdAt else { return nil }
        return ISO8601DateFormatter.qm_withFractions.date(from: createdAt)
    }
}

struct LyricLine: Decodable, Identifiable, Equatable {
    let id: String
    let text: String
    let time: Double?
}

struct TrackListResponse: Decodable {
    let tracks: [PublicTrack]
}

struct TrackDetailResponse: Decodable {
    let track: PublicTrack
}

struct LyricsResponse: Decodable {
    let trackId: String
    let lyrics: String
    let lines: [LyricLine]
}

extension ISO8601DateFormatter {
    static let qm_withFractions: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}

extension Double {
    var qm_isFinitePositive: Bool {
        isFinite && self > 0
    }
}

func qmFormatTime(_ value: Double) -> String {
    guard value.isFinite, value >= 0 else { return "0:00" }
    let total = Int(value.rounded(.down))
    return "\(total / 60):\(String(format: "%02d", total % 60))"
}
