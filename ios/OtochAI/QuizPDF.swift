import PDFKit
import SwiftUI
import UIKit

/// «Сорил» as a printable A4 worksheet: the questions with space to answer by hand, plus fillable
/// form fields (text boxes, one-of-four choices) so the same file can be filled in a PDF reader.
/// With `answerKey` a last page lists the correct answers for the teacher.
enum QuizPDF {
    private static let page = CGRect(x: 0, y: 0, width: 595.2, height: 841.8) // A4, points
    private static let margin: CGFloat = 48
    private static var contentWidth: CGFloat { page.width - margin * 2 }

    private static let violet = UIColor(red: 0.40, green: 0.30, blue: 0.85, alpha: 1)
    private static let ink = UIColor(white: 0.10, alpha: 1)
    private static let muted = UIColor(white: 0.42, alpha: 1)
    private static let rule = UIColor(white: 0.80, alpha: 1)

    private enum Field {
        case text(name: String, rect: CGRect, multiline: Bool)
        case choice(group: String, option: String, rect: CGRect)
    }

    /// Writes the worksheet to a temporary file and returns its URL.
    static func write(_ quiz: Quiz, answerKey: Bool) throws -> URL {
        let safeTitle = quiz.title.components(separatedBy: CharacterSet(charactersIn: "/\\:?%*|\"<>")).joined()
        let name = "Сорил - \(safeTitle.prefix(60))\(answerKey ? " (хариутай)" : "").pdf"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)

        var fields: [(page: Int, field: Field)] = []
        let renderer = UIGraphicsPDFRenderer(bounds: page, format: {
            let format = UIGraphicsPDFRendererFormat()
            format.documentInfo = [kCGPDFContextTitle as String: quiz.title, kCGPDFContextCreator as String: "OTech AI"]
            return format
        }())

        let data = renderer.pdfData { context in
            var pageIndex = -1
            var y: CGFloat = 0

            func newPage() {
                context.beginPage()
                pageIndex += 1
                y = margin
                footer(pageIndex + 1)
            }
            func ensure(_ height: CGFloat) {
                if y + height > page.height - margin - 24 { newPage() }
            }
            func draw(_ text: String, font: UIFont, color: UIColor = ink, indent: CGFloat = 0, spacing: CGFloat = 6) {
                let attributed = NSAttributedString(string: text, attributes: [.font: font, .foregroundColor: color, .paragraphStyle: paragraph()])
                let width = contentWidth - indent
                let height = ceil(attributed.boundingRect(with: CGSize(width: width, height: .greatestFiniteMagnitude),
                                                          options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil).height)
                ensure(height)
                attributed.draw(with: CGRect(x: margin + indent, y: y, width: width, height: height),
                                options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil)
                y += height + spacing
            }

            // Header
            newPage()
            draw("OTech AI · Сорил", font: .systemFont(ofSize: 10, weight: .semibold), color: violet, spacing: 4)
            draw(quiz.title, font: .systemFont(ofSize: 20, weight: .bold), spacing: 10)
            let line = "Нэр: ______________________________     Огноо: ____________     Оноо: ______ / 100"
            draw(line, font: .systemFont(ofSize: 11), color: muted, spacing: 14)
            hr(&y)

            for (i, question) in quiz.questions.enumerated() {
                let group = "q\(i + 1)"
                ensure(70)
                draw("\(i + 1).  \(QuizQuestion.label(for: question.kind).uppercased())",
                     font: .systemFont(ofSize: 9, weight: .bold), color: violet, spacing: 3)
                draw(question.prompt, font: .systemFont(ofSize: 12, weight: question.kind == "case" ? .regular : .semibold), spacing: 8)

                if question.kind == "choice" {
                    for (j, option) in question.options.enumerated() {
                        let letter = letterFor(j)
                        ensure(22)
                        let box = CGRect(x: margin + 14, y: y + 1, width: 12, height: 12)
                        let circle = UIBezierPath(ovalIn: box)
                        ink.setStroke(); circle.lineWidth = 0.8; circle.stroke()
                        fields.append((pageIndex, .choice(group: group, option: letter, rect: box)))
                        draw("\(letter))  \(option)", font: .systemFont(ofSize: 11.5), indent: 34, spacing: 6)
                    }
                    y += 8
                } else {
                    let lines = question.kind == "case" ? 9 : 6
                    let height = CGFloat(lines) * 22
                    ensure(height + 8)
                    let rect = CGRect(x: margin, y: y, width: contentWidth, height: height)
                    for k in 1...lines {
                        let ly = y + CGFloat(k) * 22 - 4
                        let path = UIBezierPath()
                        path.move(to: CGPoint(x: margin, y: ly)); path.addLine(to: CGPoint(x: page.width - margin, y: ly))
                        rule.setStroke(); path.lineWidth = 0.6; path.stroke()
                    }
                    fields.append((pageIndex, .text(name: group, rect: rect, multiline: true)))
                    y += height + 14
                }
            }

            if answerKey {
                newPage()
                draw("Хариу (багшид)", font: .systemFont(ofSize: 18, weight: .bold), spacing: 12)
                hr(&y)
                for (i, question) in quiz.questions.enumerated() {
                    var answer = question.modelAnswer
                    if question.kind == "choice", let j = question.options.firstIndex(of: question.modelAnswer) {
                        answer = "\(letterFor(j))) \(question.modelAnswer)"
                    }
                    draw("\(i + 1). \(answer)", font: .systemFont(ofSize: 11.5, weight: .semibold), spacing: 4)
                    if !question.keyPoints.isEmpty {
                        draw(question.keyPoints.map { "•  \($0)" }.joined(separator: "\n"), font: .systemFont(ofSize: 10.5), color: muted, indent: 14, spacing: 12)
                    }
                }
            }
        }

        // Fillable form fields on top of the drawn worksheet.
        guard let document = PDFDocument(data: data) else { throw CocoaError(.fileWriteUnknown) }
        for (index, field) in fields {
            guard let pdfPage = document.page(at: index) else { continue }
            let height = pdfPage.bounds(for: .mediaBox).height
            func flip(_ r: CGRect) -> CGRect { CGRect(x: r.minX, y: height - r.maxY, width: r.width, height: r.height) }
            switch field {
            case let .text(name, rect, multiline):
                let widget = PDFAnnotation(bounds: flip(rect), forType: .widget, withProperties: nil)
                widget.widgetFieldType = .text
                widget.fieldName = name
                widget.isMultiline = multiline
                widget.font = .systemFont(ofSize: 12)
                widget.backgroundColor = .clear
                widget.border = nil
                pdfPage.addAnnotation(widget)
            case let .choice(group, option, rect):
                let widget = PDFAnnotation(bounds: flip(rect.insetBy(dx: -1, dy: -1)), forType: .widget, withProperties: nil)
                widget.widgetFieldType = .button
                widget.widgetControlType = .radioButtonControl
                widget.fieldName = group
                widget.buttonWidgetStateString = option
                widget.backgroundColor = .clear
                widget.border = nil
                pdfPage.addAnnotation(widget)
            }
        }
        guard document.write(to: url) else { throw CocoaError(.fileWriteUnknown) }
        return url
    }

    private static func letterFor(_ index: Int) -> String {
        let letters = ["A", "B", "C", "D", "E", "F", "G", "H"]
        return index < letters.count ? letters[index] : "\(index + 1)"
    }

    private static func paragraph() -> NSParagraphStyle {
        let style = NSMutableParagraphStyle()
        style.lineSpacing = 2
        return style
    }

    private static func hr(_ y: inout CGFloat) {
        let path = UIBezierPath()
        path.move(to: CGPoint(x: margin, y: y)); path.addLine(to: CGPoint(x: page.width - margin, y: y))
        violet.withAlphaComponent(0.5).setStroke(); path.lineWidth = 1; path.stroke()
        y += 16
    }

    private static func footer(_ number: Int) {
        let text = NSAttributedString(string: "OTech AI · \(number)", attributes: [.font: UIFont.systemFont(ofSize: 9), .foregroundColor: muted])
        text.draw(at: CGPoint(x: page.width - margin - text.size().width, y: page.height - margin + 8))
    }
}

/// The system share sheet: Print, Save to Files, AirDrop, Messages…
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
