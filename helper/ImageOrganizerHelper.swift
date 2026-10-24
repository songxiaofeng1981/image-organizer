// Image Organizer helper / 图片整理本机助手
//
// Chrome starts this program through Native Messaging when the gallery page opens,
// and it exits when the page closes. It only ever touches image files inside
// ~/Downloads: list them, read them, make thumbnails, move them to the Trash.
//
// Chrome 打开图库页时通过 Native Messaging 启动本程序，页面关闭时退出。
// 它只处理 ~/Downloads 里的图片：列出、读取、生成缩略图、移到废纸篓。

import CryptoKit
import Foundation
import ImageIO
import UniformTypeIdentifiers

let helperVersion = "2.2.0"
let allowedExtensionIDs: Set<String> = ["gjmkfcibnihdnoahklpfdjcjekangjhh"]
let allowedExtensions: Set<String> = ["png", "jpg", "jpeg", "gif", "webp", "heic", "heif", "tif", "tiff", "bmp", "avif", "svg", "ico"]
// Folders that hold app or code assets, not the user's pictures.
// 这些文件夹里是程序或代码的素材，不是用户的图片。
let ignoredFolderNames: Set<String> = ["node_modules", "venv", "site-packages", "__pycache__", "Pods", "DerivedData", "bower_components"]
let chunkSize = 512 * 1024
let fm = FileManager.default

/// Real path with symlinks resolved. Foundation's resolvingSymlinksInPath drops a leading
/// "/private", which then disagrees with the paths the directory enumerator returns.
/// 解析符号链接后的真实路径。Foundation 的 resolvingSymlinksInPath 会去掉开头的 "/private"，与目录遍历返回的路径对不上。
func realURL(_ path: String) -> URL {
    guard let resolved = realpath(path, nil) else { return URL(fileURLWithPath: path).standardizedFileURL }
    defer { free(resolved) }
    return URL(fileURLWithPath: String(cString: resolved), isDirectory: true)
}

var root = realURL(NSHomeDirectory() + "/Downloads")

enum HelperError: Error, CustomStringConvertible {
    case invalidPath, unsupportedType, notAFile, missingRoot, messageTooLarge, cannotDecode, unknownOp

    var description: String {
        switch self {
        case .invalidPath: return "invalid_path"
        case .unsupportedType: return "unsupported_type"
        case .notAFile: return "not_found"
        case .missingRoot: return "no_downloads"
        case .messageTooLarge: return "message_too_large"
        case .cannotDecode: return "cannot_decode"
        case .unknownOp: return "unknown_op"
        }
    }
}

// MARK: - Native Messaging framing

let outputLock = NSLock()

func send(_ object: [String: Any]) throws {
    let payload = try JSONSerialization.data(withJSONObject: object)
    guard payload.count <= 1_000_000 else { throw HelperError.messageTooLarge }
    var length = UInt32(payload.count).littleEndian
    let header = withUnsafeBytes(of: &length) { Data($0) }
    outputLock.lock()
    defer { outputLock.unlock() }
    try FileHandle.standardOutput.write(contentsOf: header + payload)
}

func sendChunks(id: String, data: Data, mime: String) throws {
    var seq = 0
    for start in stride(from: 0, to: max(data.count, 1), by: chunkSize) {
        let end = min(start + chunkSize, data.count)
        try send(["id": id, "type": "chunk", "seq": seq, "data": data[start..<end].base64EncodedString()])
        seq += 1
    }
    try send(["id": id, "type": "done", "mime": mime])
}

func readExactly(_ count: Int) -> Data? {
    var result = Data()
    while result.count < count {
        guard let part = try? FileHandle.standardInput.read(upToCount: count - result.count), !part.isEmpty else { return nil }
        result.append(part)
    }
    return result
}

// MARK: - Path safety

/// Turns a path relative to Downloads into a URL, refusing anything that could escape it:
/// absolute paths, "..", hidden components, symbolic links and non-image files.
/// 把相对 Downloads 的路径变成 URL；拒绝绝对路径、".."、隐藏项、符号链接和非图片文件。
func resolve(_ raw: String) throws -> URL {
    guard !raw.isEmpty, !raw.hasPrefix("/"), !raw.contains("\\") else { throw HelperError.invalidPath }
    let parts = raw.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
    guard parts.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." && !$0.hasPrefix(".") }) else { throw HelperError.invalidPath }
    let candidate = parts.reduce(root) { $0.appendingPathComponent($1) }
    guard candidate.path.hasPrefix(root.path + "/") else { throw HelperError.invalidPath }
    var cursor = root
    for part in parts {
        cursor.appendPathComponent(part)
        if (try cursor.resourceValues(forKeys: [.isSymbolicLinkKey])).isSymbolicLink == true { throw HelperError.invalidPath }
    }
    guard allowedExtensions.contains(candidate.pathExtension.lowercased()) else { throw HelperError.unsupportedType }
    guard (try candidate.resourceValues(forKeys: [.isRegularFileKey])).isRegularFile == true else { throw HelperError.notAFile }
    return candidate
}

// MARK: - Listing

struct Entry {
    let url: URL
    let relative: String
    let ext: String
    let size: Int
    let added: Date
    let modified: Date
    var meta = Meta()
    var duplicateOf = ""
}

/// What the file says about itself, read without decoding any pixels.
/// Used by the gallery to sort pictures into smart categories.
/// 文件自身带的信息，不解码像素即可读到。图库用它做智能分类。
struct Meta {
    var width = 0
    var height = 0
    var make = ""          // camera maker, e.g. "Apple" / 相机厂商
    var model = ""         // camera model, e.g. "iPhone 17" / 相机型号
    var screenshot = false // macOS/iOS marked it as a screen capture / 系统标记的截屏
    var frames = 1         // > 1 for animated GIF/WebP/PNG / 动图的帧数
    var from: [String] = [] // websites it was downloaded from (host names only) / 下载来源网站（只取域名）
}

/// Reads an extended attribute that holds a property list, such as the ones macOS writes on downloads.
/// 读取以属性列表存储的扩展属性，例如 macOS 给下载文件写入的那些。
func plistAttribute(_ url: URL, _ name: String) -> Any? {
    let size = getxattr(url.path, name, nil, 0, 0, XATTR_NOFOLLOW)
    guard size > 0 else { return nil }
    var data = Data(count: size)
    let read = data.withUnsafeMutableBytes { getxattr(url.path, name, $0.baseAddress, size, 0, XATTR_NOFOLLOW) }
    guard read == size else { return nil }
    return try? PropertyListSerialization.propertyList(from: data, format: nil)
}

func meta(of url: URL, ext: String) -> Meta {
    var m = Meta()
    // Browsers record where a download came from (Chrome: page and file URL). Only the host names are kept.
    // 浏览器会记录下载来源（Chrome 记录网页和文件地址），这里只保留域名。
    if let urls = plistAttribute(url, "com.apple.metadata:kMDItemWhereFroms") as? [String] {
        var hosts: [String] = []
        for case let host? in urls.map({ URL(string: $0)?.host?.lowercased() }) where !hosts.contains(host) { hosts.append(host) }
        m.from = hosts
    }
    if let flag = plistAttribute(url, "com.apple.metadata:kMDItemIsScreenCapture") as? Bool { m.screenshot = flag }
    guard ext != "svg",
          let source = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
          CGImageSourceGetCount(source) > 0,
          let props = CGImageSourceCopyPropertiesAtIndex(source, CGImageSourceGetPrimaryImageIndex(source), [kCGImageSourceShouldCache: false] as CFDictionary) as? [CFString: Any]
    else { return m }
    m.frames = ["gif", "webp", "png"].contains(ext) ? CGImageSourceGetCount(source) : 1
    let w = props[kCGImagePropertyPixelWidth] as? Int ?? 0
    let h = props[kCGImagePropertyPixelHeight] as? Int ?? 0
    let orientation = props[kCGImagePropertyOrientation] as? Int ?? 1
    (m.width, m.height) = orientation >= 5 ? (h, w) : (w, h)
    let tiff = props[kCGImagePropertyTIFFDictionary] as? [CFString: Any]
    m.make = (tiff?[kCGImagePropertyTIFFMake] as? String ?? "").trimmingCharacters(in: .whitespaces)
    m.model = (tiff?[kCGImagePropertyTIFFModel] as? String ?? "").trimmingCharacters(in: .whitespaces)
    // Screenshots from macOS and iOS carry the comment "Screenshot". / macOS 和 iOS 的截屏带有 "Screenshot" 注释。
    let exif = props[kCGImagePropertyExifDictionary] as? [CFString: Any]
    if (exif?[kCGImagePropertyExifUserComment] as? String)?.lowercased().contains("screenshot") == true { m.screenshot = true }
    return m
}

/// Content hash, only for files that share their byte size with another file.
/// 内容哈希；只对和其他文件大小完全相同的文件计算。
func sha256(_ url: URL) -> String? {
    guard let file = try? FileHandle(forReadingFrom: url) else { return nil }
    defer { try? file.close() }
    var hasher = SHA256()
    while let chunk = try? file.read(upToCount: 1 << 20), !chunk.isEmpty { hasher.update(data: chunk) }
    return hasher.finalize().map { String(format: "%02x", $0) }.joined()
}

/// Marks exact copies: every file after the first with the same content gets `duplicateOf` = the first one's path.
/// 标记完全相同的副本：内容相同的文件中，除第一个外都把 duplicateOf 设为第一个的路径。
func markDuplicates(_ entries: inout [Entry]) {
    var bySize: [Int: [Int]] = [:]
    for (i, e) in entries.enumerated() where e.size > 0 { bySize[e.size, default: []].append(i) }
    let candidates = bySize.values.filter { $0.count > 1 }.flatMap { $0 }
    guard !candidates.isEmpty else { return }
    var hashes = [String?](repeating: nil, count: candidates.count)
    let urls = candidates.map { entries[$0].url }
    hashes.withUnsafeMutableBufferPointer { out in
        DispatchQueue.concurrentPerform(iterations: urls.count) { k in out[k] = sha256(urls[k]) }
    }
    var firstWith: [String: Int] = [:]
    // Oldest download counts as the original. / 最早下载的那个算作原件。
    for k in candidates.indices.sorted(by: { entries[candidates[$0]].added < entries[candidates[$1]].added }) {
        guard let h = hashes[k] else { continue }
        if let first = firstWith[h] { entries[candidates[k]].duplicateOf = entries[first].relative } else { firstWith[h] = candidates[k] }
    }
}

func scan() throws -> [Entry] {
    let keys: [URLResourceKey] = [.isDirectoryKey, .isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey,
                                  .contentModificationDateKey, .addedToDirectoryDateKey, .creationDateKey]
    guard fm.fileExists(atPath: root.path),
          let walker = fm.enumerator(at: root, includingPropertiesForKeys: keys, options: [.skipsHiddenFiles, .skipsPackageDescendants])
    else { throw HelperError.missingRoot }
    var entries: [Entry] = []
    while let url = walker.nextObject() as? URL {
        guard let values = try? url.resourceValues(forKeys: Set(keys)) else { continue }
        if values.isDirectory == true {
            if values.isSymbolicLink == true || ignoredFolderNames.contains(url.lastPathComponent) { walker.skipDescendants() }
            continue
        }
        let ext = url.pathExtension.lowercased()
        guard values.isSymbolicLink != true, values.isRegularFile == true, allowedExtensions.contains(ext) else { continue }
        let modified = values.contentModificationDate ?? Date(timeIntervalSince1970: 0)
        entries.append(Entry(url: url, relative: String(url.path.dropFirst(root.path.count + 1)), ext: ext,
                             size: values.fileSize ?? 0,
                             added: values.addedToDirectoryDate ?? values.creationDate ?? modified,
                             modified: modified))
    }
    // Header reads are independent, so do them in parallel. / 各文件头互不相关，并行读取。
    entries.withUnsafeMutableBufferPointer { buffer in
        DispatchQueue.concurrentPerform(iterations: buffer.count) { i in
            buffer[i].meta = meta(of: buffer[i].url, ext: buffer[i].ext)
        }
    }
    markDuplicates(&entries)
    return entries
}

func list(id: String) throws {
    let iso = ISO8601DateFormatter()
    var batch: [[String: Any]] = []
    for e in try scan() {
        let parent = (e.relative as NSString).deletingLastPathComponent
        var item: [String: Any] = ["path": e.relative, "name": e.url.lastPathComponent, "folder": parent, "ext": e.ext,
                                   "size": e.size, "added": iso.string(from: e.added), "modified": iso.string(from: e.modified),
                                   "width": e.meta.width, "height": e.meta.height]
        // Optional fields are sent only when present, to keep messages small. / 可选字段只在有值时发送。
        if !e.meta.make.isEmpty { item["make"] = e.meta.make }
        if !e.meta.model.isEmpty { item["model"] = e.meta.model }
        if e.meta.screenshot { item["screenshot"] = true }
        if e.meta.frames > 1 { item["frames"] = e.meta.frames }
        if !e.meta.from.isEmpty { item["from"] = e.meta.from }
        if !e.duplicateOf.isEmpty { item["duplicateOf"] = e.duplicateOf }
        batch.append(item)
        if batch.count >= 200 {
            try send(["id": id, "type": "images", "items": batch])
            batch.removeAll(keepingCapacity: true)
        }
    }
    if !batch.isEmpty { try send(["id": id, "type": "images", "items": batch]) }
    try send(["id": id, "type": "done"])
}

// MARK: - Image data

let mimeTypes = ["png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp",
                 "bmp": "image/bmp", "avif": "image/avif", "svg": "image/svg+xml", "ico": "image/x-icon"]

/// Downscaled JPEG made with ImageIO. Uses an embedded thumbnail when one is large enough.
/// 用 ImageIO 生成缩小的 JPEG；文件里自带的缩略图够大时直接用它。
func jpeg(_ url: URL, maxPixelSize: Int) throws -> Data {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary) else { throw HelperError.cannotDecode }
    let options: [CFString: Any] = [
        kCGImageSourceCreateThumbnailFromImageIfAbsent: true,
        kCGImageSourceThumbnailMaxPixelSize: min(4096, max(128, maxPixelSize)),
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceShouldCacheImmediately: true,
    ]
    var image = CGImageSourceCreateThumbnailAtIndex(source, CGImageSourceGetPrimaryImageIndex(source), options as CFDictionary)
    // An embedded thumbnail can be much smaller than asked for; decode the full image then.
    // 自带缩略图可能远小于所需尺寸，这时改为从原图生成。
    if let small = image, max(small.width, small.height) < maxPixelSize / 2 {
        var always = options
        always[kCGImageSourceCreateThumbnailFromImageAlways] = true
        image = CGImageSourceCreateThumbnailAtIndex(source, CGImageSourceGetPrimaryImageIndex(source), always as CFDictionary) ?? small
    }
    guard let cg = image else { throw HelperError.cannotDecode }
    let out = NSMutableData()
    guard let dest = CGImageDestinationCreateWithData(out, UTType.jpeg.identifier as CFString, 1, nil) else { throw HelperError.cannotDecode }
    CGImageDestinationAddImage(dest, cg, [kCGImageDestinationLossyCompressionQuality: 0.84] as CFDictionary)
    guard CGImageDestinationFinalize(dest) else { throw HelperError.cannotDecode }
    return out as Data
}

func thumb(id: String, path: String, size: Int) throws {
    let url = try resolve(path)
    if url.pathExtension.lowercased() == "svg" {
        try sendChunks(id: id, data: try Data(contentsOf: url), mime: "image/svg+xml")
    } else {
        try sendChunks(id: id, data: try jpeg(url, maxPixelSize: size), mime: "image/jpeg")
    }
}

/// Full-size image for the viewer. Formats Chrome can show are sent as-is; HEIC and TIFF
/// are converted to JPEG in memory. The original file is never changed.
/// 大图查看用。Chrome 能直接显示的格式原样发送；HEIC、TIFF 在内存里转成 JPEG，不改原文件。
func full(id: String, path: String) throws {
    let url = try resolve(path)
    let ext = url.pathExtension.lowercased()
    if let mime = mimeTypes[ext] {
        try sendChunks(id: id, data: try Data(contentsOf: url, options: .mappedIfSafe), mime: mime)
    } else {
        try sendChunks(id: id, data: try jpeg(url, maxPixelSize: 4096), mime: "image/jpeg")
    }
}

/// Moves files to the Trash, never deletes them outright. / 移到废纸篓，从不直接删除。
func trash(id: String, paths: [String]) throws {
    var done: [String] = []
    var failed: [[String: String]] = []
    for path in paths {
        do {
            try fm.trashItem(at: try resolve(path), resultingItemURL: nil)
            done.append(path)
        } catch {
            failed.append(["path": path, "error": "\(error)"])
        }
    }
    try send(["id": id, "type": "result", "ok": failed.isEmpty, "trashed": done, "failed": failed])
}

func reveal(id: String, path: String) throws {
    let url = try resolve(path)
    let task = Process()
    task.executableURL = URL(fileURLWithPath: "/usr/bin/open")
    task.arguments = ["-R", url.path]
    try task.run()
    try send(["id": id, "type": "result", "ok": true])
}

// MARK: - Dispatch

func handle(_ request: [String: Any]) {
    let id = request["id"] as? String ?? ""
    let path = request["path"] as? String ?? ""
    do {
        switch request["op"] as? String {
        case "hello": try send(["id": id, "type": "result", "ok": true, "version": helperVersion])
        case "list": try list(id: id)
        case "thumb": try thumb(id: id, path: path, size: request["size"] as? Int ?? 512)
        case "full": try full(id: id, path: path)
        case "trash": try trash(id: id, paths: request["paths"] as? [String] ?? [])
        case "reveal": try reveal(id: id, path: path)
        default: throw HelperError.unknownOp
        }
    } catch {
        try? send(["id": id, "type": "error", "error": "\(error)"])
    }
}

// MARK: - Self test (no Chrome needed) / 自测（不需要 Chrome）

func selftest() -> Never {
    print("Image Organizer helper \(helperVersion)")
    print("Folder / 文件夹: \(root.path)")
    let t0 = Date()
    do {
        let entries = try scan()
        print(String(format: "Found %d images in %.2fs / 找到 %d 张图片，用时 %.2f 秒", entries.count, Date().timeIntervalSince(t0), entries.count, Date().timeIntervalSince(t0)))
        let sample = entries.filter { $0.ext != "svg" }.sorted { $0.added > $1.added }.prefix(20)
        let t1 = Date()
        var failures = 0
        for e in sample {
            if (try? jpeg(e.url, maxPixelSize: 512)) == nil { failures += 1; print("  cannot decode / 无法解码: \(e.relative)") }
        }
        print(String(format: "Made %d thumbnails in %.2fs / 生成 %d 张缩略图，用时 %.2f 秒", sample.count, Date().timeIntervalSince(t1), sample.count, Date().timeIntervalSince(t1)))
        exit(failures == 0 ? 0 : 1)
    } catch {
        print("Error / 出错: \(error)")
        print("If this says no_downloads or a permission error, allow access to Downloads when macOS asks.")
        print("如果提示 no_downloads 或权限错误，请在 macOS 询问时允许访问“下载”文件夹。")
        exit(1)
    }
}

let args = CommandLine.arguments
// --root points the helper at another folder, for development and tests only. Chrome never passes it.
// --root 让助手读取另一个文件夹，仅供开发和测试；Chrome 不会传这个参数。
if let i = args.firstIndex(of: "--root"), i + 1 < args.count {
    root = realURL(args[i + 1])
}
if args.contains("--selftest") { selftest() }
if args.contains("--version") { print(helperVersion); exit(0) }

// Chrome passes the caller's origin as the first argument. / Chrome 会把调用方的 origin 作为第一个参数传入。
let callerAllowed = args.dropFirst().contains { arg in
    allowedExtensionIDs.contains { arg == "chrome-extension://\($0)/" || arg == "chrome-extension://\($0)" }
}
guard callerAllowed else {
    fputs("Rejected caller origin\n", stderr)
    exit(2)
}

// Requests run in parallel (at most 4 at a time) so a large file never blocks thumbnails.
// 请求并行处理（最多 4 个），大文件不会卡住缩略图。
let workers = DispatchQueue(label: "image-organizer.workers", attributes: .concurrent)
let slots = DispatchSemaphore(value: 4)
let inFlight = DispatchGroup()
while let header = readExactly(4) {
    let length = header.withUnsafeBytes { $0.loadUnaligned(as: UInt32.self).littleEndian }
    guard length > 0, length <= 4 * 1024 * 1024, let body = readExactly(Int(length)) else { break }
    guard let request = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] else {
        try? send(["id": "", "type": "error", "error": "bad_request"])
        continue
    }
    slots.wait()
    inFlight.enter()
    workers.async {
        handle(request)
        slots.signal()
        inFlight.leave()
    }
}
inFlight.wait()
