// Manage.swift: managing pictures in Downloads and the library: list, thumb, full, trash, reveal,
// file, unfile, renameFolder.
// Manage.swift：管理“下载”和图片库里的图片：list、thumb、full、trash、reveal、file、unfile、renameFolder。

import CryptoKit
import Foundation
import ImageIO
import UniformTypeIdentifiers

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
