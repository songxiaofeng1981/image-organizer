// VideoSave.swift: saving a video fetched from a web page into a category. Videos are too big for one message,
// so the page sends them in pieces: videoBegin → videoChunk … → videoFinish (or videoCancel). The pieces go into a
// hidden file in the library, hashed as they arrive; at the end the size and the type are checked and the file is
// moved into the category folder with the same tag, comment, source addresses and index entry as a saved picture.
// VideoSave.swift：把从网页取来的视频存进分类。视频太大，一条消息放不下，所以分块发送：videoBegin → videoChunk …
// → videoFinish（或 videoCancel）。各块写进图片库里的一个隐藏文件，边收边算 SHA-256；最后核对大小和类型，
// 再移进分类文件夹，标签、注释、来源网址和索引记录与保存图片相同。

import CryptoKit
import Foundation

let videoExtensions: Set<String> = ["mp4", "mov", "m4v"]
let maxVideoSize = 4 * 1024 * 1024 * 1024 // 4 GB
let partialPrefix = ".io-video-"

enum VideoError: Error, CustomStringConvertible {
    case badSize, unknownUpload, outOfOrder, sizeMismatch, notAVideo
    var description: String {
        switch self {
        case .badSize: return "bad_size"
        case .unknownUpload: return "unknown_upload"
        case .outOfOrder: return "out_of_order"
        case .sizeMismatch: return "size_mismatch"
        case .notAVideo: return "not_a_video"
        }
    }
}

/// One video being received. / 正在接收的一个视频。
final class Upload {
    let url: URL
    let handle: FileHandle
    let expected: Int
    var written = 0
    var hasher = SHA256()
    var head = Data()
    init(url: URL, handle: FileHandle, expected: Int) {
        self.url = url
        self.handle = handle
        self.expected = expected
    }
}

let uploadsLock = NSLock()
var uploads: [String: Upload] = [:]

func upload(_ token: String) throws -> Upload {
    uploadsLock.lock()
    defer { uploadsLock.unlock() }
    guard let u = uploads[token] else { throw VideoError.unknownUpload }
    return u
}

func dropUpload(_ token: String) -> Upload? {
    uploadsLock.lock()
    defer { uploadsLock.unlock() }
    return uploads.removeValue(forKey: token)
}

/// Starts receiving a video of `size` bytes. Leftovers older than a day (from a closed page) go to the Trash.
/// 开始接收一个 size 字节的视频。超过一天的残留文件（页面中途关闭留下的）移到废纸篓。
func videoBegin(id: String, size: Int) throws {
    guard size > 0, size <= maxVideoSize else { throw VideoError.badSize }
    let lib = try library()
    let dayAgo = Date().addingTimeInterval(-86_400)
    for name in (try? fm.contentsOfDirectory(atPath: lib.path)) ?? [] where name.hasPrefix(partialPrefix) {
        let url = lib.appendingPathComponent(name)
        if let modified = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate, modified < dayAgo {
            try? fm.trashItem(at: url, resultingItemURL: nil)
        }
    }
    let token = UUID().uuidString
    let url = lib.appendingPathComponent("\(partialPrefix)\(token).part")
    guard fm.createFile(atPath: url.path, contents: nil) else { throw HelperError.invalidPath }
    let handle = try FileHandle(forWritingTo: url)
    uploadsLock.lock()
    uploads[token] = Upload(url: url, handle: handle, expected: size)
    uploadsLock.unlock()
    try send(["id": id, "type": "result", "ok": true, "token": token])
}

/// Appends one piece. `offset` must equal the bytes received so far, so pieces cannot be lost or repeated.
/// 追加一块。offset 必须等于已收到的字节数，块不会丢也不会重复。
func videoChunk(id: String, token: String, offset: Int, data b64: String) throws {
    let u = try upload(token)
    guard let data = Data(base64Encoded: b64), !data.isEmpty else { throw HelperError.cannotDecode }
    guard offset == u.written else { throw VideoError.outOfOrder }
    guard u.written + data.count <= u.expected else { throw VideoError.sizeMismatch }
    try u.handle.write(contentsOf: data)
    u.hasher.update(data: data)
    if u.head.count < 16 { u.head.append(data.prefix(16 - u.head.count)) }
    u.written += data.count
    try send(["id": id, "type": "result", "ok": true, "written": u.written])
}

/// MP4 or QuickTime, from the file's own header ("ftyp" box), never from its name. / 由文件头（ftyp）判断是 MP4 还是 QuickTime。
func videoExtension(_ head: Data) -> String? {
    guard head.count >= 12, String(decoding: head[4..<8], as: UTF8.self) == "ftyp" else { return nil }
    switch String(decoding: head[8..<12], as: UTF8.self) {
    case "qt  ": return "mov"
    case "M4V ", "M4VH", "M4VP": return "m4v"
    default: return "mp4"
    }
}

/// Checks the received video and moves it into the category folder. A video already in the library (same content)
/// is not kept twice. Reply: { path, duplicate? }.
/// 核对收到的视频并移进分类文件夹。图片库里已有相同内容时不重复保存。
func videoFinish(id: String, token: String, name rawName: String, folder rawFolder: String, tag: [String: Any]?,
                 comment: String?, from: [String]) throws {
    guard let u = dropUpload(token) else { throw VideoError.unknownUpload }
    try? u.handle.close()
    var moved = false
    defer { if !moved { try? fm.removeItem(at: u.url) } }
    guard u.written == u.expected else { throw VideoError.sizeMismatch }
    guard let ext = videoExtension(u.head), videoExtensions.contains(ext) else { throw VideoError.notAVideo }
    let hash = u.hasher.finalize().map { String(format: "%02x", $0) }.joined()
    libraryLock.lock()
    defer { libraryLock.unlock() }
    let lib = try library()
    let folder = lib.appendingPathComponent(try folderName(rawFolder), isDirectory: true)
    if (try? folder.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink) == true { throw HelperError.invalidFolder }
    if !fm.fileExists(atPath: folder.path) { try fm.createDirectory(at: folder, withIntermediateDirectories: false) }
    var index = readIndex(lib)
    if let existing = index.first(where: { $0.value["sha256"] as? String == hash && fm.fileExists(atPath: lib.appendingPathComponent($0.key).path) })?.key {
        return try send(["id": id, "type": "result", "ok": true, "path": libPrefix + existing, "duplicate": true])
    }
    let dest = freeURL(in: folder, name: "\(fileStem(rawName, fallback: "video")).\(ext)")
    try fm.moveItem(at: u.url, to: dest)
    moved = true
    let key = try recordSaved(dest, in: lib, index: &index, size: u.written, hash: hash, tag: tag, comment: comment, from: from, kind: "video")
    try send(["id": id, "type": "result", "ok": true, "path": libPrefix + key])
}

/// Stops a video halfway (the page was closed or a piece failed): the hidden file is removed.
/// 中途停止（页面关了或某一块失败）：删除隐藏的临时文件。
func videoCancel(id: String, token: String) throws {
    if let u = dropUpload(token) {
        try? u.handle.close()
        try? fm.removeItem(at: u.url)
    }
    try send(["id": id, "type": "result", "ok": true])
}
