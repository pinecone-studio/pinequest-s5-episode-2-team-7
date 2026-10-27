import LinkPresentation
import SafariServices
import SwiftUI

/// One published article from the web app's news (pinequest-team7 /api/news).
struct NewsItem: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let summary: String
    /// general | research | public-health | clinical | education (pinequest-team7 NEWS_CATEGORIES)
    let category: String?
    let sourceName: String?
    let sourceUrl: String?
    /// The feed's own picture for the item (server: news_articles.image_url), when it has one.
    let imageUrl: String?
    let publishedAt: String?

    var source: String { sourceName ?? "Otech AI" }
    var link: String? { sourceUrl }

    var day: String? {
        guard let publishedAt, let parsed = ISO8601DateFormatter.withFractions.date(from: publishedAt) ?? ISO8601DateFormatter().date(from: publishedAt) else { return nil }
        return parsed.formatted(date: .abbreviated, time: .omitted)
    }
}

extension ISO8601DateFormatter {
    static let withFractions: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}

/// Shared by the News tab and the home screen's preview.
@MainActor
final class NewsStore: ObservableObject {
    @Published private(set) var items: [NewsItem] = []
    @Published private(set) var loading = false
    @Published private(set) var error: String?
    /// The server is importing fresh news (first run): try again shortly.
    @Published private(set) var preparing = false

    private struct Body: Decodable { let news: [NewsItem]; let refreshing: Bool? }

    func load(force: Bool = false) async {
        if loading || (!items.isEmpty && !force) { return }
        loading = true
        error = nil
        defer { loading = false }
        do {
            let request = await QuizAPI.signedRequest("api/news", timeout: 30)
            let (data, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 401 {
                self.error = "Мэдээ харахын тулд эхлээд «Өвчтөн» хэсэгт нэвтэрнэ үү."
                return
            }
            guard status == 200 else { throw URLError(.badServerResponse) }
            let body = try JSONDecoder().decode(Body.self, from: data)
            items = body.news
            preparing = body.news.isEmpty && body.refreshing == true
            if preparing {
                Task { [weak self] in
                    try? await Task.sleep(for: .seconds(20))
                    await self?.load(force: true)
                }
            }
        } catch {
            self.error = "Мэдээг ачаалж чадсангүй. Сервертэй холбогдож байгаа эсэхийг шалгаад дахин оролдоно уу."
        }
    }

    /// The role's categories first (in the role's priority order), then the rest; newest first within each.
    func ordered(for role: UserRole) -> [NewsItem] {
        let priority = role.newsCategories
        func rank(_ item: NewsItem) -> Int { priority.firstIndex(of: item.category ?? "general") ?? priority.count }
        return items.enumerated()
            .sorted { a, b in
                let (ra, rb) = (rank(a.element), rank(b.element))
                return ra != rb ? ra < rb : a.offset < b.offset
            }
            .map(\.element)
    }
}

struct NewsView: View {
    @EnvironmentObject private var news: NewsStore
    @AppStorage(UserRole.storageKey) private var roleRaw = ""
    @State private var opened: NewsItem?
    /// nil = «Танд» (ordered for the role), "" = «Бүгд», otherwise one category.
    @State private var filter: String?

    private var role: UserRole { UserRole(rawValue: roleRaw) ?? .student }

    private var shown: [NewsItem] {
        switch filter {
        case nil: return news.ordered(for: role)
        case ""?: return news.items
        case let category?: return news.items.filter { ($0.category ?? "general") == category }
        }
    }

    private var categories: [String] {
        let present = Set(news.items.map { $0.category ?? "general" })
        return ["clinical", "research", "public-health", "education", "general"].filter { present.contains($0) }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Мэдээ").font(.system(size: 32, weight: .semibold)).foregroundStyle(.white)
                        Text("\(role.title)-д хамааралтай эрүүл мэндийн шинэ мэдээ").font(.subheadline).foregroundStyle(.white.opacity(0.9))
                    }

                    if news.items.isEmpty && news.loading {
                        ProgressView().controlSize(.large).frame(maxWidth: .infinity).padding(.top, 60)
                    } else if news.items.isEmpty {
                        emptyState
                    } else {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                FilterChip(title: "Танд", selected: filter == nil) { filter = nil }
                                FilterChip(title: "Бүгд", selected: filter == "") { filter = "" }
                                ForEach(categories, id: \.self) { category in
                                    FilterChip(title: NewsCategory.label(category), selected: filter == category) { filter = category }
                                }
                            }
                        }
                        if let first = shown.first {
                            Button { opened = first } label: { FeaturedNewsCard(item: first) }.buttonStyle(.plain)
                        }
                        ForEach(shown.dropFirst()) { item in
                            Button { opened = item } label: { NewsCard(item: item) }.buttonStyle(.plain)
                        }
                        if shown.isEmpty {
                            Text("Энэ ангилалд мэдээ алга байна.").font(.subheadline).foregroundStyle(Theme.muted)
                        }
                        Text("Гадаадын эрүүл мэндийн сэтгүүлүүдийн мэдээг AI монголчилсон тул алдаа байж болно; дэлгэрэнгүйг эх сурвалжаас уншина уу.")
                            .font(.caption).foregroundStyle(Theme.muted)
                    }
                }
                .padding(20)
            }
            .refreshable { await news.load(force: true) }
            .appScreen()
            .toolbar(.hidden, for: .navigationBar)
        }
        .tint(brand)
        .task { await news.load() }
        .sheet(item: $opened) { item in
            if let link = item.link, let url = URL(string: link) { SafariView(url: url).ignoresSafeArea() }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: news.error == nil ? "newspaper" : "wifi.exclamationmark").font(.system(size: 40)).foregroundStyle(brand)
            Text(news.error != nil ? "Мэдээ ачаалсангүй" : news.preparing ? "Шинэ мэдээ бэлтгэж байна…" : "Нийтлэгдсэн мэдээ алга байна").font(.headline)
            Text(news.error ?? (news.preparing ? "Дэлхийн эрүүл мэндийн сэтгүүлүүдээс мэдээ татаж, монгол руу орчуулж байна. Хэдэн секундад гарч ирнэ." : "Админ мэдээ нийтлэхэд энд гарч ирнэ.")).font(.subheadline).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
            Button("Дахин оролдох") { Task { await news.load(force: true) } }.buttonStyle(.secondary).frame(maxWidth: 220)
        }
        .frame(maxWidth: .infinity)
        .card(padding: 24, radius: 26)
    }
}

private struct FilterChip: View {
    let title: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .foregroundStyle(selected ? Theme.accentInk : Theme.ink)
                .background(selected ? AnyShapeStyle(Theme.accentGradient) : AnyShapeStyle(Theme.field), in: Capsule())
                .overlay(Capsule().stroke(Theme.line))
        }
        .buttonStyle(.plain)
    }
}

/// Big top story: picture across the card, title over a dark fade.
struct FeaturedNewsCard: View {
    let item: NewsItem

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            NewsImage(item: item).frame(height: 220).clipped()
            LinearGradient(colors: [.clear, .black.opacity(0.75)], startPoint: .center, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 6) {
                NewsMeta(item: item, light: true)
                Text(item.title).font(.title3.weight(.bold)).foregroundStyle(.white).lineLimit(3).multilineTextAlignment(.leading)
            }
            .padding(16)
        }
        .frame(height: 220)
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(Theme.line))
        .shadow(color: Theme.shadow, radius: 14, y: 6)
    }
}

/// List story: text left, square picture right.
struct NewsCard: View {
    let item: NewsItem
    var compact = false

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                NewsMeta(item: item, light: false)
                Text(item.title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink).lineLimit(3).multilineTextAlignment(.leading)
                if !compact {
                    Text(item.summary).font(.caption).foregroundStyle(Theme.muted).lineLimit(2).multilineTextAlignment(.leading)
                }
            }
            Spacer(minLength: 0)
            NewsImage(item: item)
                .frame(width: 88, height: 88)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .card(padding: 12, radius: 24)
    }
}

private struct NewsMeta: View {
    let item: NewsItem
    let light: Bool
    var body: some View {
        HStack(spacing: 6) {
            Text(NewsCategory.label(item.category ?? "general"))
                .font(.caption2.weight(.bold))
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(light ? AnyShapeStyle(Color.white.opacity(0.25)) : AnyShapeStyle(Theme.accentSoft), in: Capsule())
                .foregroundStyle(light ? .white : brand)
            Text(item.source).font(.caption2).foregroundStyle(light ? .white.opacity(0.85) : Theme.muted).lineLimit(1)
            if let day = item.day { Text("· \(day)").font(.caption2).foregroundStyle(light ? .white.opacity(0.85) : Theme.muted) }
        }
    }
}

/// The article's picture: the one the feed publishes (imageUrl), else the page's
/// og:image (fetched once and cached), else a category illustration.
struct NewsImage: View {
    let item: NewsItem
    @State private var image: UIImage?

    var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                LinearGradient(colors: NewsArt.colors(item.category), startPoint: .topLeading, endPoint: .bottomTrailing)
                Image(systemName: NewsArt.icon(item.category)).font(.system(size: 34)).foregroundStyle(.white.opacity(0.9))
            }
        }
        .task(id: item.id) {
            if let raw = item.imageUrl, let url = URL(string: raw), let picture = await NewsImageCache.shared.picture(at: url) {
                image = picture
                return
            }
            guard let link = item.link, let url = URL(string: link) else { return }
            image = await NewsImageCache.shared.image(for: url)
        }
        .accessibilityHidden(true)
    }
}

enum NewsArt {
    static func colors(_ category: String?) -> [Color] {
        switch category {
        case "research": return [Theme.rgb(0x8EC5FA), Theme.rgb(0x6C63C9)]
        case "public-health": return [Theme.rgb(0x7DDBB7), Theme.rgb(0x2E9C8A)]
        case "clinical": return [Theme.rgb(0xF6A6D9), Theme.rgb(0xC13CEB)]
        case "education": return [Theme.rgb(0xFFD09B), Theme.rgb(0xF08A5D)]
        default: return [Theme.rgb(0xB7A6F4), Theme.rgb(0x93B6F6)]
        }
    }

    static func icon(_ category: String?) -> String {
        switch category {
        case "research": return "flask.fill"
        case "public-health": return "globe.asia.australia.fill"
        case "clinical": return "stethoscope"
        case "education": return "graduationcap.fill"
        default: return "newspaper.fill"
        }
    }
}

/// Fetches a page's preview image (og:image) with LinkPresentation; one request per link.
actor NewsImageCache {
    static let shared = NewsImageCache()
    private var cache: [URL: UIImage] = [:]
    private var misses: Set<URL> = []

    func image(for url: URL) async -> UIImage? {
        if let hit = cache[url] { return hit }
        if misses.contains(url) { return nil }
        let image = await Self.fetch(url)
        if let image { cache[url] = image } else { misses.insert(url) }
        return image
    }

    /// A direct image URL (the feed's picture).
    func picture(at url: URL) async -> UIImage? {
        if let hit = cache[url] { return hit }
        if misses.contains(url) { return nil }
        let image: UIImage? = await {
            guard let (data, response) = try? await URLSession.shared.data(from: url),
                  (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
            return UIImage(data: data)
        }()
        if let image { cache[url] = image } else { misses.insert(url) }
        return image
    }

    @MainActor
    private static func fetch(_ url: URL) async -> UIImage? {
        let provider = LPMetadataProvider()
        provider.timeout = 12
        guard let metadata = try? await provider.startFetchingMetadata(for: url),
              let itemProvider = metadata.imageProvider else { return nil }
        return await withCheckedContinuation { continuation in
            itemProvider.loadObject(ofClass: UIImage.self) { object, _ in
                continuation.resume(returning: object as? UIImage)
            }
        }
    }
}

struct SafariView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}
