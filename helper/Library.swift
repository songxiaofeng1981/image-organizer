// Library.swift: the picture library, shared by managing and saving: settings, index, Finder tags and
// comments, checked moves, and the config / setLibrary / chooseFolder requests.
// Library.swift：图片库，管理和保存共用：设置、索引、访达标签和注释、校验后的移动，以及 config / setLibrary / chooseFolder 请求。

import CryptoKit
import Foundation
import ImageIO
import UniformTypeIdentifiers

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

/// A plain file name stem from the page: no folders, no leading dot, no control characters, at most 120 characters.
/// 来自网页的文件名主体：不含文件夹、不以点开头、没有控制字符，最多 120 个字符。
func fileStem(_ raw: String, fallback: String) -> String {
    var stem = ((raw as NSString).lastPathComponent as NSString).deletingPathExtension
    stem = String(stem.unicodeScalars.filter { !CharacterSet.controlCharacters.contains($0) && !"/:\\".unicodeScalars.contains($0) })
    stem = String(stem.drop(while: { $0 == "." || $0 == " " }).prefix(120)).trimmingCharacters(in: .whitespaces)
    return stem.isEmpty ? fallback : stem
}

/// After a file from a web page is in place: its source addresses (like a browser download), Finder tag and comment,
/// and its index entry. `kind` is set for anything that is not a picture ("video"). Returns the library-relative path.
/// 网页上保存的文件放好之后：写入来源网址（和浏览器下载一样）、访达标签和注释、索引记录。不是图片时写 kind（"video"）。
func recordSaved(_ dest: URL, in lib: URL, index: inout [String: [String: Any]], size: Int, hash: String, tag: [String: Any]?,
                 comment: String?, from: [String], kind: String? = nil) throws -> String {
    let urls = from.filter { $0.hasPrefix("http://") || $0.hasPrefix("https://") }
    if !urls.isEmpty { setPlistAttribute(dest, "com.apple.metadata:kMDItemWhereFroms", urls) }
    retag(dest, remove: nil, add: tag)
    if let comment, !comment.isEmpty { setPlistAttribute(dest, commentAttribute, comment) }
    let now = ISO8601DateFormatter().string(from: Date())
    var info: [String: Any] = ["originalName": dest.lastPathComponent, "downloaded": now, "filed": now, "size": size, "sha256": hash]
    let hosts = urls.compactMap { URL(string: $0)?.host?.lowercased() }
    if !hosts.isEmpty { info["from"] = Array(NSOrderedSet(array: hosts)) }
    if let page = urls.last { info["page"] = page }
    if let kind { info["kind"] = kind }
    let key = relative(dest, in: lib)
    index[key] = info
    try writeIndex(lib, index)
    return key
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

/// Content hash, only for files that share their byte size with another file.
/// 内容哈希；只对和其他文件大小完全相同的文件计算。
func sha256(_ url: URL) -> String? {
    guard let file = try? FileHandle(forReadingFrom: url) else { return nil }
    defer { try? file.close() }
    var hasher = SHA256()
    while let chunk = try? file.read(upToCount: 1 << 20), !chunk.isEmpty { hasher.update(data: chunk) }
    return hasher.finalize().map { String(format: "%02x", $0) }.joined()
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
