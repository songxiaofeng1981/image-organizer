// Image Organizer helper / 图片整理本机助手
//
// Chrome starts this program through Native Messaging when the gallery page opens,
// and it exits when the page closes. It only ever touches image files inside
// ~/Downloads and in the picture library the user chose: list them, read them, make thumbnails,
// file them into the library, move them to the Trash.
//
// Chrome 打开图库页时通过 Native Messaging 启动本程序，页面关闭时退出。
// 它只处理 ~/Downloads 和用户选定的图片库里的图片：列出、读取、生成缩略图、归入图片库、移到废纸篓。

import CryptoKit
import Foundation
import ImageIO
import UniformTypeIdentifiers

let helperVersion = "2.3.0"
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
// Where settings.json lives (the picture library's location). / settings.json（图片库位置）所在的文件夹。
var configDir = URL(fileURLWithPath: NSHomeDirectory() + "/Library/Application Support/ImageOrganizer", isDirectory: true)
// Paths in the picture library start with this; all other paths are inside Downloads.
// 图片库里的路径以它开头；其他路径都在“下载”里。
let libPrefix = "lib:"

enum HelperError: Error, CustomStringConvertible {
    case invalidPath, unsupportedType, notAFile, missingRoot, messageTooLarge, cannotDecode, unknownOp
    case noLibrary, libraryOffline, badLibrary, invalidFolder, folderExists, copyMismatch

    var description: String {
        switch self {
        case .invalidPath: return "invalid_path"
        case .unsupportedType: return "unsupported_type"
        case .notAFile: return "not_found"
        case .missingRoot: return "no_downloads"
        case .messageTooLarge: return "message_too_large"
        case .cannotDecode: return "cannot_decode"
        case .unknownOp: return "unknown_op"
        case .noLibrary: return "no_library"
        case .libraryOffline: return "library_offline"
        case .badLibrary: return "bad_library"
        case .invalidFolder: return "invalid_folder"
        case .folderExists: return "folder_exists"
        case .copyMismatch: return "copy_mismatch"
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

/// The folder a page path belongs to: the picture library for "lib:…", otherwise Downloads.
/// 页面路径所属的文件夹：“lib:…” 属于图片库，其他属于“下载”。
func base(of raw: String) throws -> (URL, String) {
    if raw.hasPrefix(libPrefix) { return (try library(), String(raw.dropFirst(libPrefix.count))) }
    return (root, raw)
}

/// Turns a page path (relative to Downloads, or "lib:" + relative to the library) into a URL,
/// refusing anything that could escape it: absolute paths, "..", hidden components, symbolic links and non-image files.
/// 把页面路径（相对“下载”，或 “lib:” 加相对图片库的路径）变成 URL；拒绝绝对路径、".."、隐藏项、符号链接和非图片文件。
func resolve(_ raw: String) throws -> URL {
    let (top, rel) = try base(of: raw)
    guard !rel.isEmpty, !rel.hasPrefix("/"), !rel.contains("\\") else { throw HelperError.invalidPath }
    let parts = rel.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
    guard parts.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." && !$0.hasPrefix(".") }) else { throw HelperError.invalidPath }
    let candidate = parts.reduce(top) { $0.appendingPathComponent($1) }
    guard candidate.path.hasPrefix(top.path + "/") else { throw HelperError.invalidPath }
    var cursor = top
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
    // A copy already in the picture library counts as the original, then the oldest download.
    // 已在图片库里的那份算作原件；其次是最早下载的那个。
    let rank = { (e: Entry) in (e.relative.hasPrefix(libPrefix) ? 0 : 1, e.added.timeIntervalSince1970) }
    for k in candidates.indices.sorted(by: { rank(entries[candidates[$0]]) < rank(entries[candidates[$1]]) }) {
        guard let h = hashes[k] else { continue }
        if let first = firstWith[h] { entries[candidates[k]].duplicateOf = entries[first].relative } else { firstWith[h] = candidates[k] }
    }
}

/// Every picture in Downloads, plus the picture library when it is set and connected.
/// “下载”里的所有图片；图片库已设置且已连接时，也包括图片库里的。
func scan() throws -> [Entry] {
    var entries = try scan(root, prefix: "")
    if let lib = try? library() { entries += (try? scan(lib, prefix: libPrefix)) ?? [] }
    // Header reads are independent, so do them in parallel. / 各文件头互不相关，并行读取。
    entries.withUnsafeMutableBufferPointer { buffer in
        DispatchQueue.concurrentPerform(iterations: buffer.count) { i in
            buffer[i].meta = meta(of: buffer[i].url, ext: buffer[i].ext)
        }
    }
    markDuplicates(&entries)
    return entries
}

func scan(_ top: URL, prefix: String) throws -> [Entry] {
    let keys: [URLResourceKey] = [.isDirectoryKey, .isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey,
                                  .contentModificationDateKey, .addedToDirectoryDateKey, .creationDateKey]
    guard fm.fileExists(atPath: top.path),
          let walker = fm.enumerator(at: top, includingPropertiesForKeys: keys, options: [.skipsHiddenFiles, .skipsPackageDescendants])
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
        entries.append(Entry(url: url, relative: prefix + String(url.path.dropFirst(top.path.count + 1)), ext: ext,
                             size: values.fileSize ?? 0,
                             added: values.addedToDirectoryDate ?? values.creationDate ?? modified,
                             modified: modified))
    }
    return entries
}

func list(id: String) throws {
    let iso = ISO8601DateFormatter()
    let index = (try? library()).map(readIndex) ?? [:]
    var batch: [[String: Any]] = []
    for e in try scan() {
        let inLibrary = e.relative.hasPrefix(libPrefix)
        let parent = (String(e.relative.dropFirst(inLibrary ? libPrefix.count : 0)) as NSString).deletingLastPathComponent
        var item: [String: Any] = ["path": e.relative, "name": e.url.lastPathComponent, "folder": parent, "ext": e.ext,
                                   "size": e.size, "added": iso.string(from: e.added), "modified": iso.string(from: e.modified),
                                   "width": e.meta.width, "height": e.meta.height]
        if inLibrary {
            // Pictures in the library keep the time they were downloaded, so they sort the same as before.
            // 图片库里的图沿用当初的下载时间，排序和以前一样。
            item["library"] = true
            item["filed"] = iso.string(from: e.added)
            if let info = index[String(e.relative.dropFirst(libPrefix.count))] {
                if let d = info["downloaded"] as? String { item["added"] = d }
                if let n = info["originalName"] as? String { item["originalName"] = n }
            }
        }
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
    let fromLibrary = done.filter { $0.hasPrefix(libPrefix) }
    if !fromLibrary.isEmpty, let lib = try? library() {
        libraryLock.lock()
        var index = readIndex(lib)
        for p in fromLibrary { index.removeValue(forKey: String(p.dropFirst(libPrefix.count))) }
        try? writeIndex(lib, index)
        libraryLock.unlock()
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

// MARK: - Picture library / 图片库
//
// Filing a picture moves it out of Downloads into <library>/<category>/. Across drives the file is
// copied, the copy is checked byte for byte, and only then is the original removed. Each picture gets
// a Finder tag (the category) and a Finder comment, and the library keeps an index of where every
// picture came from in a hidden .image-organizer.json, so nothing depends on Chrome's storage.
// 归类会把图片从“下载”移到 <图片库>/<分类>/。跨硬盘时先复制，逐字节核对副本，确认无误后才移走原件。
// 每张图会加上访达标签（分类名）和访达注释；图片库里隐藏的 .image-organizer.json 记录每张图的来历，
// 不依赖 Chrome 的存储。

let indexName = ".image-organizer.json"
// Library changes run one at a time. / 对图片库的修改一次只做一个。
let libraryLock = NSLock()

func readSettings() -> [String: Any] {
    guard let data = try? Data(contentsOf: configDir.appendingPathComponent("settings.json")),
          let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return [:] }
    return object
}

func writeSettings(_ settings: [String: Any]) throws {
    try fm.createDirectory(at: configDir, withIntermediateDirectories: true)
    let data = try JSONSerialization.data(withJSONObject: settings, options: [.prettyPrinted, .sortedKeys])
    try data.write(to: configDir.appendingPathComponent("settings.json"), options: .atomic)
}

/// The library folder, if one is set and it is there (the drive may be unplugged).
/// 图片库文件夹；需要已设置并且存在（外置硬盘可能没接上）。
func library() throws -> URL {
    guard let path = readSettings()["library"] as? String, !path.isEmpty else { throw HelperError.noLibrary }
    var isDir: ObjCBool = false
    guard fm.fileExists(atPath: path, isDirectory: &isDir), isDir.boolValue else { throw HelperError.libraryOffline }
    return realURL(path)
}

func readIndex(_ lib: URL) -> [String: [String: Any]] {
    guard let data = try? Data(contentsOf: lib.appendingPathComponent(indexName)),
          let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
          let files = object["files"] as? [String: [String: Any]] else { return [:] }
    return files
}

func writeIndex(_ lib: URL, _ files: [String: [String: Any]]) throws {
    let data = try JSONSerialization.data(withJSONObject: ["version": 1, "files": files], options: [.prettyPrinted, .sortedKeys])
    try data.write(to: lib.appendingPathComponent(indexName), options: .atomic)
}

func setPlistAttribute(_ url: URL, _ name: String, _ value: Any?) {
    guard let value, let data = try? PropertyListSerialization.data(fromPropertyList: value, format: .binary, options: 0) else {
        removexattr(url.path, name, XATTR_NOFOLLOW)
        return
    }
    _ = data.withUnsafeBytes { setxattr(url.path, name, $0.baseAddress, data.count, 0, XATTR_NOFOLLOW) }
}

let tagsAttribute = "com.apple.metadata:_kMDItemUserTags"
let commentAttribute = "com.apple.metadata:kMDItemFinderComment"

/// Finder tags are stored as "name\ncolor" strings. Takes away `remove` and adds `add` (name + Finder color 0–7).
/// 访达标签以 “名称\n颜色” 存储。去掉 remove，加上 add（名称 + 访达颜色 0–7）。
func retag(_ url: URL, remove: String?, add: [String: Any]?) {
    var tags = (plistAttribute(url, tagsAttribute) as? [String]) ?? []
    let name = { (tag: String) in String(tag.split(separator: "\n", omittingEmptySubsequences: false).first ?? "") }
    let addName = add?["name"] as? String
    tags.removeAll { name($0) == remove || name($0) == addName }
    if let addName, !addName.isEmpty { tags.append("\(addName)\n\(add?["color"] as? Int ?? 0)") }
    setPlistAttribute(url, tagsAttribute, tags.isEmpty ? nil : tags)
}

/// A category folder name: one plain path component. / 分类文件夹名：单独一级的普通名称。
func folderName(_ raw: String) throws -> String {
    let name = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty, name.count <= 120, !name.hasPrefix("."), !name.contains("/"), !name.contains(":"), !name.contains("\\")
    else { throw HelperError.invalidFolder }
    return name
}

/// "name.png", or "name 2.png", "name 3.png" … if that is taken. / 重名时依次加编号。
func freeURL(in folder: URL, name: String) -> URL {
    let stem = (name as NSString).deletingPathExtension
    let ext = (name as NSString).pathExtension
    var n = 1
    while true {
        let candidate = folder.appendingPathComponent(n == 1 ? name : "\(stem) \(n)" + (ext.isEmpty ? "" : ".\(ext)"))
        if !fm.fileExists(atPath: candidate.path) { return candidate }
        n += 1
    }
}

func sameVolume(_ a: URL, _ b: URL) -> Bool {
    let va = try? a.resourceValues(forKeys: [.volumeIdentifierKey]).volumeIdentifier as? NSObject
    let vb = try? b.resourceValues(forKeys: [.volumeIdentifierKey]).volumeIdentifier as? NSObject
    return va != nil && va == vb
}

/// Moves a file. On another drive: copy under a hidden name, check the copy matches, then remove the original.
/// The original is never removed unless an identical copy is in place.
/// 移动文件。跨硬盘时：先用隐藏的名字复制，核对副本完全一致，再移走原件。没有完全一致的副本，原件绝不会被移走。
func safeMove(_ src: URL, to dest: URL, hash: String? = nil) throws {
    if sameVolume(src, dest.deletingLastPathComponent()) {
        try fm.moveItem(at: src, to: dest)
        return
    }
    let partial = dest.deletingLastPathComponent().appendingPathComponent(".io-partial-\(UUID().uuidString).\(dest.pathExtension)")
    do {
        try fm.copyItem(at: src, to: partial)
        let size = { (u: URL) in (try? u.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? -1 }
        guard size(partial) == size(src), let expected = hash ?? sha256(src), sha256(partial) == expected else { throw HelperError.copyMismatch }
        try fm.moveItem(at: partial, to: dest)
    } catch {
        try? fm.removeItem(at: partial)
        throw error
    }
    try fm.removeItem(at: src)
}

/// Library-relative path of a library URL. / 图片库内的相对路径。
func relative(_ url: URL, in top: URL) -> String { String(url.path.dropFirst(top.path.count + 1)) }

/// Files pictures into a category folder of the library. Each item: { path, comment?, removeTag? }.
/// From Downloads: moved (checked copy) with tag, comment and an index entry; a picture already in the library
/// (same content) is not copied again, the download goes to the Trash instead. From the library: moved to the other folder.
/// 把图片归入图片库的分类文件夹。来自“下载”的：校验后移动，加标签、注释和索引记录；图片库里已有内容相同的图时不再复制，
/// 下载的这份移到废纸篓。来自图片库的：移到另一个分类文件夹。
func file(id: String, items: [[String: Any]], folder rawFolder: String, tag: [String: Any]?) throws {
    libraryLock.lock()
    defer { libraryLock.unlock() }
    let lib = try library()
    let folder = lib.appendingPathComponent(try folderName(rawFolder), isDirectory: true)
    if (try? folder.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink) == true { throw HelperError.invalidFolder }
    if !fm.fileExists(atPath: folder.path) { try fm.createDirectory(at: folder, withIntermediateDirectories: false) }
    var index = readIndex(lib)
    var byHash: [String: String] = [:]
    for (path, info) in index { if let h = info["sha256"] as? String, fm.fileExists(atPath: lib.appendingPathComponent(path).path) { byHash[h] = path } }
    let iso = ISO8601DateFormatter()
    var moved: [[String: Any]] = []
    var failed: [[String: String]] = []
    for item in items {
        let path = item["path"] as? String ?? ""
        do {
            let src = try resolve(path)
            if path.hasPrefix(libPrefix) {
                if src.deletingLastPathComponent().path == folder.path {
                    moved.append(["from": path, "to": path])
                    continue
                }
                let dest = freeURL(in: folder, name: src.lastPathComponent)
                try fm.moveItem(at: src, to: dest)
                retag(dest, remove: item["removeTag"] as? String, add: tag)
                let old = relative(src, in: lib), new = relative(dest, in: lib)
                if let info = index.removeValue(forKey: old) { index[new] = info }
                moved.append(["from": path, "to": libPrefix + new])
                continue
            }
            let values = try src.resourceValues(forKeys: [.addedToDirectoryDateKey, .creationDateKey, .fileSizeKey])
            guard let hash = sha256(src) else { throw HelperError.cannotDecode }
            if let existing = byHash[hash] {
                try fm.trashItem(at: src, resultingItemURL: nil)
                moved.append(["from": path, "to": libPrefix + existing, "duplicate": true])
                continue
            }
            let dest = freeURL(in: folder, name: src.lastPathComponent)
            try safeMove(src, to: dest, hash: hash)
            retag(dest, remove: nil, add: tag)
            if let comment = item["comment"] as? String, !comment.isEmpty { setPlistAttribute(dest, commentAttribute, comment) }
            let new = relative(dest, in: lib)
            var info: [String: Any] = ["originalName": src.lastPathComponent, "originalPath": path, "filed": iso.string(from: Date()),
                                       "size": values.fileSize ?? 0, "sha256": hash]
            if let added = values.addedToDirectoryDate ?? values.creationDate { info["downloaded"] = iso.string(from: added) }
            let from = meta(of: dest, ext: dest.pathExtension.lowercased()).from
            if !from.isEmpty { info["from"] = from }
            index[new] = info
            byHash[hash] = new
            moved.append(["from": path, "to": libPrefix + new])
        } catch {
            failed.append(["path": path, "error": "\(error)"])
        }
    }
    try writeIndex(lib, index)
    try send(["id": id, "type": "result", "ok": failed.isEmpty, "moved": moved, "failed": failed])
}

/// Puts library pictures back into Downloads, where they were before (used by Undo and by "Move back to Downloads").
/// 把图片库里的图放回“下载”原来的位置（用于撤销和“移回下载”）。
func unfile(id: String, items: [[String: Any]]) throws {
    libraryLock.lock()
    defer { libraryLock.unlock() }
    let lib = try library()
    var index = readIndex(lib)
    var moved: [[String: Any]] = []
    var failed: [[String: String]] = []
    for item in items {
        let path = item["path"] as? String ?? ""
        do {
            guard path.hasPrefix(libPrefix) else { throw HelperError.invalidPath }
            let src = try resolve(path)
            let key = relative(src, in: lib)
            let info = index[key] ?? [:]
            // Back into the same sub-folder of Downloads if it is still there, else Downloads itself.
            // 原来的子文件夹还在就放回去，否则放在“下载”里。
            var folder = root
            var name = info["originalName"] as? String ?? src.lastPathComponent
            if let original = info["originalPath"] as? String, !original.hasPrefix(libPrefix) {
                let parent = (original as NSString).deletingLastPathComponent
                let candidate = parent.isEmpty ? root : root.appendingPathComponent(parent, isDirectory: true)
                var isDir: ObjCBool = false
                if !parent.contains(".."), fm.fileExists(atPath: candidate.path, isDirectory: &isDir), isDir.boolValue { folder = candidate }
                name = (original as NSString).lastPathComponent
            }
            if name.hasPrefix(".") || !allowedExtensions.contains((name as NSString).pathExtension.lowercased()) { name = src.lastPathComponent }
            let dest = freeURL(in: folder, name: name)
            retag(src, remove: item["removeTag"] as? String, add: nil)
            setPlistAttribute(src, commentAttribute, nil)
            try safeMove(src, to: dest, hash: info["sha256"] as? String)
            index.removeValue(forKey: key)
            moved.append(["from": path, "to": relative(dest, in: root)])
        } catch {
            failed.append(["path": path, "error": "\(error)"])
        }
    }
    try writeIndex(lib, index)
    try send(["id": id, "type": "result", "ok": failed.isEmpty, "moved": moved, "failed": failed])
}

/// Renames a category folder (or, with the same name, only changes the tag color) and updates the pictures' tags.
/// 重命名分类文件夹（名称不变时只改标签颜色），并更新其中图片的标签。
func renameFolder(id: String, from rawFrom: String, to rawTo: String, removeTag: String?, tag: [String: Any]?) throws {
    libraryLock.lock()
    defer { libraryLock.unlock() }
    let lib = try library()
    let fromName = try folderName(rawFrom), toName = try folderName(rawTo)
    let src = lib.appendingPathComponent(fromName, isDirectory: true)
    var dest = lib.appendingPathComponent(toName, isDirectory: true)
    let values = try? src.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
    guard values?.isDirectory == true, values?.isSymbolicLink != true else {
        // Nothing filed there yet: nothing to rename. / 还没有图片归入：不需要改。
        return try send(["id": id, "type": "result", "ok": true])
    }
    if fromName != toName {
        // Only the letter case changes: APFS sees the same folder. / 只改大小写时，APFS 认为是同一个文件夹。
        if fm.fileExists(atPath: dest.path), fromName.lowercased() != toName.lowercased() { throw HelperError.folderExists }
        try fm.moveItem(at: src, to: dest)
        dest = lib.appendingPathComponent(toName, isDirectory: true)
    }
    if let walker = fm.enumerator(at: dest, includingPropertiesForKeys: [.isRegularFileKey], options: [.skipsHiddenFiles]) {
        while let url = walker.nextObject() as? URL {
            if allowedExtensions.contains(url.pathExtension.lowercased()) { retag(url, remove: removeTag, add: tag) }
        }
    }
    if fromName != toName {
        var index = readIndex(lib)
        for key in index.keys where key.hasPrefix(fromName + "/") {
            index[toName + key.dropFirst(fromName.count)] = index.removeValue(forKey: key)
        }
        try writeIndex(lib, index)
    }
    try send(["id": id, "type": "result", "ok": true])
}

/// Where the library is, whether it is connected, and places to suggest when it is not set yet.
/// 图片库在哪里、是否已连接；还没设置时给出建议的位置。
func config(id: String, name: String) throws {
    let path = readSettings()["library"] as? String
    var suggestions = [NSHomeDirectory() + "/Pictures/" + name]
    let keys: [URLResourceKey] = [.volumeIsRootFileSystemKey, .volumeIsReadOnlyKey, .volumeIsLocalKey]
    for volume in fm.mountedVolumeURLs(includingResourceValuesForKeys: keys, options: [.skipHiddenVolumes]) ?? [] {
        guard let v = try? volume.resourceValues(forKeys: Set(keys)), v.volumeIsRootFileSystem != true,
              v.volumeIsReadOnly != true, v.volumeIsLocal == true, volume.path.hasPrefix("/Volumes/") else { continue }
        suggestions.append(volume.appendingPathComponent(name).path)
    }
    var reply: [String: Any] = ["id": id, "type": "result", "ok": true, "available": (try? library()) != nil, "suggestions": suggestions]
    if let path { reply["library"] = path }
    try send(reply)
}

/// Sets the library folder, creating it (one level) if needed. Refuses system folders, the home folder itself,
/// and anything inside Downloads or containing it.
/// 设置图片库文件夹，需要时新建（只建一级）。拒绝系统文件夹、个人文件夹本身，以及“下载”里面或包含“下载”的位置。
func setLibrary(id: String, path rawPath: String, name: String) throws {
    libraryLock.lock()
    defer { libraryLock.unlock() }
    let expanded = (rawPath.trimmingCharacters(in: .whitespacesAndNewlines) as NSString).expandingTildeInPath
    guard expanded.hasPrefix("/"), !expanded.split(separator: "/").contains(where: { $0 == ".." || $0.hasPrefix(".") }) else { throw HelperError.badLibrary }
    var url = URL(fileURLWithPath: expanded, isDirectory: true)
    var isDir: ObjCBool = false
    if !fm.fileExists(atPath: url.path, isDirectory: &isDir) {
        let parent = url.deletingLastPathComponent()
        guard fm.fileExists(atPath: parent.path, isDirectory: &isDir), isDir.boolValue else { throw HelperError.badLibrary }
        try fm.createDirectory(at: url, withIntermediateDirectories: false)
    } else if !isDir.boolValue {
        throw HelperError.badLibrary
    }
    url = realURL(url.path)
    let p = url.path, home = realURL(NSHomeDirectory()).path, downloads = root.path
    let system = ["/System", "/Library", "/Applications", "/usr", "/bin", "/sbin", "/etc", "/private/etc", "/private/var/db", "/opt", "/cores", "/dev"]
    guard p != "/", p != home, p != "/Volumes", p != home + "/Library", !p.hasPrefix(home + "/Library/"),
          !system.contains(where: { p == $0 || p.hasPrefix($0 + "/") }),
          p != downloads, !p.hasPrefix(downloads + "/"), !downloads.hasPrefix(p + "/"),
          fm.isWritableFile(atPath: p)
    else { throw HelperError.badLibrary }
    var settings = readSettings()
    settings["library"] = p
    try writeSettings(settings)
    try config(id: id, name: name)
}

/// Shows the macOS "Choose Folder" window. / 显示 macOS 的“选择文件夹”窗口。
func chooseFolder(id: String, prompt: String) throws {
    let task = Process()
    let out = Pipe()
    task.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
    let escaped = prompt.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
    task.arguments = ["-e", "POSIX path of (choose folder with prompt \"\(escaped)\")"]
    task.standardOutput = out
    task.standardError = FileHandle.nullDevice
    try task.run()
    task.waitUntilExit()
    let path = String(data: out.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    var reply: [String: Any] = ["id": id, "type": "result", "ok": !path.isEmpty]
    if !path.isEmpty { reply["path"] = path.count > 1 && path.hasSuffix("/") ? String(path.dropLast()) : path }
    try send(reply)
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
        case "config": try config(id: id, name: request["name"] as? String ?? "Picture Library")
        case "setLibrary": try setLibrary(id: id, path: path, name: request["name"] as? String ?? "Picture Library")
        case "chooseFolder": try chooseFolder(id: id, prompt: request["prompt"] as? String ?? "")
        case "file": try file(id: id, items: request["items"] as? [[String: Any]] ?? [], folder: request["folder"] as? String ?? "",
                              tag: request["tag"] as? [String: Any])
        case "unfile": try unfile(id: id, items: request["items"] as? [[String: Any]] ?? [])
        case "renameFolder": try renameFolder(id: id, from: request["from"] as? String ?? "", to: request["to"] as? String ?? "",
                                              removeTag: request["removeTag"] as? String, tag: request["tag"] as? [String: Any])
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
// --config keeps settings.json (the library location) somewhere else, also for development and tests.
// --config 把 settings.json（图片库位置）放在别处，同样只供开发和测试。
if let i = args.firstIndex(of: "--config"), i + 1 < args.count {
    configDir = URL(fileURLWithPath: args[i + 1], isDirectory: true)
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
