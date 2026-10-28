import Charts
import SwiftUI

// MARK: - Models (mirror pinequest-team7 src/lib/services/coach.ts → memberProgress)

struct MemberProgress: Decodable {
    struct Member: Decodable { let userId: String; let name: String; let joinedAt: String }
    struct Stats: Decodable {
        let count: Int
        let average: Int?
        let best: Int?
        let last: Int?
        let trend: Int?
        let minutes: Int
        let lastActive: String?
        let passed: Int
        let pending: Int
        let overdue: Int
    }
    struct Criterion: Decodable, Identifiable {
        let label: String
        let met: Int
        let partial: Int
        let missed: Int
        let total: Int
        let rate: Int
        var id: String { label }
    }
    struct Challenge: Decodable, Identifiable {
        let id: String
        let title: String
        let targetScore: Int
        let attempts: Int
        let best: Int?
        let passed: Bool
        let overdue: Bool
        let dueAt: String?
    }
    struct Result: Decodable, Identifiable {
        let id: String
        let packTitle: String
        let score: Int
        let durationSec: Int
        let challengeTitle: String?
        let passed: Bool?
        let summary: String
        let createdAt: String
        var date: Date { ServerAPI.date(createdAt) }
    }

    let member: Member
    let stats: Stats
    let criteria: [Criterion]
    let focus: [String]
    let challenges: [Challenge]
    let results: [Result]
}

/// Navigation value: open one employee's progress.
struct MemberRoute: Hashable {
    let teamId: String
    let userId: String
    let name: String
}

// MARK: - Screen (owner)

struct MemberProgressView: View {
    let route: MemberRoute
    @State private var data: MemberProgress?
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                if let data {
                    statTiles(data.stats)
                    if data.results.count >= 2 { chart(data) }
                    if !data.criteria.isEmpty { criteria(data.criteria) }
                    if !data.focus.isEmpty { focus(data) }
                    if !data.challenges.isEmpty { challenges(data.challenges) }
                    results(data.results)
                } else if let error {
                    Text(error).font(.footnote).foregroundStyle(Theme.alert)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(40)
                }
            }
            .padding(20)
        }
        .refreshable { await load() }
        .appScreen()
        .navigationTitle(route.name)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        do {
            data = try await ServerAPI.get("api/teams/\(route.teamId)/members/\(route.userId)", as: MemberProgress.self)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: Parts

    private var header: some View {
        HStack(spacing: 14) {
            Text(String(route.name.prefix(1)).uppercased())
                .font(.title.weight(.semibold)).foregroundStyle(.white)
                .frame(width: 58, height: 58).background(Theme.accentGradient, in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(route.name).font(.title2.weight(.semibold)).foregroundStyle(Theme.ink)
                if let data {
                    Text(activityLine(data)).font(.caption).foregroundStyle(Theme.muted)
                }
            }
        }
    }

    private func activityLine(_ d: MemberProgress) -> String {
        let joined = ServerAPI.date(d.member.joinedAt).formatted(.dateTime.month(.abbreviated).day())
        guard let last = d.stats.lastActive else { return "\(joined)-нд нэгдсэн · одоогоор дадлага хийгээгүй" }
        return "Сүүлд \(ServerAPI.date(last).formatted(.relative(presentation: .named))) · \(d.stats.minutes) мин дадлага"
    }

    private func statTiles(_ s: MemberProgress.Stats) -> some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            tile(s.average.map(String.init) ?? "–", "дундаж", s.average.map(scoreColor) ?? Theme.subtle)
            tile(trendText(s.trend), "сүүлийн өөрчлөлт", trendColor(s.trend))
            tile("\(s.count)", "дадлага", brand)
            tile("\(s.passed)", "тэнцсэн сорилт", Theme.ok)
            tile("\(s.pending)", "хүлээгдэж буй", s.pending > 0 ? Theme.warn : Theme.subtle)
            tile("\(s.overdue)", "хугацаа хэтэрсэн", s.overdue > 0 ? Theme.alert : Theme.subtle)
        }
    }

    private func trendText(_ t: Int?) -> String {
        guard let t else { return "–" }
        return t > 0 ? "▲ \(t)" : t < 0 ? "▼ \(-t)" : "＝ 0"
    }

    private func trendColor(_ t: Int?) -> Color {
        guard let t else { return Theme.subtle }
        return t > 0 ? Theme.ok : t < 0 ? Theme.alert : Theme.muted
    }

    private func tile(_ value: String, _ label: String, _ color: Color) -> some View {
        VStack(spacing: 4) {
            Text(value).font(.title3.weight(.semibold).monospacedDigit()).foregroundStyle(color)
            Text(label).font(.caption2).foregroundStyle(Theme.muted).multilineTextAlignment(.center).lineLimit(2)
        }
        .frame(maxWidth: .infinity, minHeight: 70)
        .card(padding: 10, radius: 18)
    }

    private func chart(_ d: MemberProgress) -> some View {
        let points = Array(d.results.reversed().suffix(20))
        return VStack(alignment: .leading, spacing: 10) {
            Text("Онооны явц").font(.headline).foregroundStyle(Theme.ink)
            Chart {
                ForEach(Array(points.enumerated()), id: \.element.id) { i, r in
                    AreaMark(x: .value("Дадлага", i + 1), y: .value("Оноо", r.score))
                        .foregroundStyle(LinearGradient(colors: [Theme.accent.opacity(0.35), .clear], startPoint: .top, endPoint: .bottom))
                        .interpolationMethod(.catmullRom)
                    LineMark(x: .value("Дадлага", i + 1), y: .value("Оноо", r.score))
                        .foregroundStyle(Theme.accent)
                        .interpolationMethod(.catmullRom)
                    PointMark(x: .value("Дадлага", i + 1), y: .value("Оноо", r.score))
                        .foregroundStyle(scoreColor(r.score))
                }
                RuleMark(y: .value("Тэнцэх", 70))
                    .foregroundStyle(Theme.subtle)
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                    .annotation(position: .top, alignment: .leading) { Text("70").font(.caption2).foregroundStyle(Theme.subtle) }
            }
            .chartYScale(domain: 0...100)
            .chartXAxis(.hidden)
            .frame(height: 170)
        }
        .card(padding: 16, radius: 22)
    }

    private func criteria(_ items: [MemberProgress.Criterion]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Шалгуураар").font(.headline).foregroundStyle(Theme.ink)
            Text("Хамгийн их унадаг нь дээрээ.").font(.caption).foregroundStyle(Theme.muted)
            ForEach(items) { c in
                VStack(alignment: .leading, spacing: 5) {
                    HStack {
                        Text(c.label).font(.subheadline).foregroundStyle(Theme.ink).lineLimit(2)
                        Spacer()
                        Text("\(c.rate)%").font(.subheadline.weight(.semibold).monospacedDigit()).foregroundStyle(scoreColor(c.rate))
                    }
                    GeometryReader { g in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Theme.field)
                            Capsule().fill(scoreColor(c.rate)).frame(width: g.size.width * CGFloat(c.rate) / 100)
                        }
                    }
                    .frame(height: 7)
                    Text("\(c.met) биелсэн · \(c.partial) дутуу · \(c.missed) биелээгүй").font(.caption2).foregroundStyle(Theme.subtle)
                }
            }
        }
        .card(padding: 16, radius: 22)
    }

    private func focus(_ d: MemberProgress) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Анхаарах зүйл", systemImage: "lightbulb.fill").font(.headline).foregroundStyle(Theme.gold)
            if let weakest = d.criteria.first, weakest.rate < 70 {
                Text("«\(weakest.label)» шалгуур дээр хамгийн их унаж байна. Энэ сэдвээр тусгай сорилт өгвөл үр дүнтэй.")
                    .font(.subheadline).foregroundStyle(Theme.ink)
            }
            ForEach(d.focus, id: \.self) { line in
                HStack(alignment: .top, spacing: 8) {
                    Text("•").foregroundStyle(Theme.gold)
                    Text(line).font(.subheadline).foregroundStyle(Theme.ink)
                }
            }
        }
        .card(padding: 16, radius: 22)
    }

    private func challenges(_ items: [MemberProgress.Challenge]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Сорилтууд").font(.headline).foregroundStyle(Theme.ink)
            ForEach(items) { c in
                HStack(spacing: 12) {
                    Image(systemName: c.passed ? "checkmark.seal.fill" : c.overdue ? "exclamationmark.circle.fill" : c.attempts > 0 ? "xmark.seal" : "clock")
                        .foregroundStyle(c.passed ? Theme.ok : c.overdue ? Theme.alert : c.attempts > 0 ? Theme.warn : Theme.subtle)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(c.title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
                        Text(challengeLine(c)).font(.caption).foregroundStyle(Theme.muted)
                    }
                    Spacer()
                    if let best = c.best { Text("\(best)").font(.headline.monospacedDigit()).foregroundStyle(scoreColor(best)) }
                }
                .padding(10).background(Theme.field, in: RoundedRectangle(cornerRadius: 14))
            }
        }
    }

    private func challengeLine(_ c: MemberProgress.Challenge) -> String {
        var parts = ["Зорилт \(c.targetScore)", c.attempts == 0 ? "хийгээгүй" : "\(c.attempts) оролдлого"]
        if c.overdue { parts.append("хугацаа хэтэрсэн") } else if let due = c.dueAt {
            parts.append("\(ServerAPI.date(due).formatted(.dateTime.month(.abbreviated).day())) хүртэл")
        }
        return parts.joined(separator: " · ")
    }

    private func results(_ items: [MemberProgress.Result]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Бүх дадлага").font(.headline).foregroundStyle(Theme.ink)
            if items.isEmpty {
                Text("Багийн сорилт, дадлага хийгээгүй байна. Хувийн дадлага нь зөвхөн ажилтанд өөрт нь харагдана.")
                    .font(.caption).foregroundStyle(Theme.muted)
            }
            ForEach(items) { r in
                NavigationLink(value: r.id) {
                    HStack(alignment: .top, spacing: 12) {
                        Text("\(r.score)")
                            .font(.headline.monospacedDigit())
                            .frame(width: 44, height: 44)
                            .background(scoreColor(r.score).opacity(0.15), in: Circle())
                            .foregroundStyle(scoreColor(r.score))
                        VStack(alignment: .leading, spacing: 3) {
                            Text(r.challengeTitle ?? r.packTitle).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink).lineLimit(1)
                            Text(r.summary).font(.caption).foregroundStyle(Theme.muted).lineLimit(2).multilineTextAlignment(.leading)
                            Text("\(r.date.formatted(date: .abbreviated, time: .shortened)) · \(max(1, r.durationSec / 60)) мин")
                                .font(.caption2).foregroundStyle(Theme.subtle)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.subtle).padding(.top, 14)
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }
}
