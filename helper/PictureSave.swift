// PictureSave.swift: saving a picture fetched from a web page into a category (the save request).
// PictureSave.swift：把从网页取来的图片存进分类（save 请求）。

import CryptoKit
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Saves a picture taken from a web page (its bytes, base64) into a category folder of the library.
/// The type comes from the bytes, not the name; anything that is not a picture is refused. A picture already in the
/// library (same content) is not saved twice. The page and image addresses are kept like a browser download's.
/// 把从网页取来的图片（base64 数据）存进图片库的分类文件夹。格式按数据本身判断，不是图片就拒绝；图片库里已有相同内容时不重复保存。
/// 网页地址和图片地址像浏览器下载那样记录下来。
func save(id: String, data b64: String, name rawName: String, folder rawFolder: String, tag: [String: Any]?,
          comment: String?, from: [String]) throws {
    guard let data = Data(base64Encoded: b64), !data.isEmpty else { throw HelperError.cannotDecode }
    guard let source = CGImageSourceCreateWithData(data as CFData, nil), let uti = CGImageSourceGetType(source) as String?,
          var ext = UTType(uti)?.preferredFilenameExtension?.lowercased()
    else { throw HelperError.unsupportedType }
    if ext == "jpeg" { ext = "jpg" }
    guard allowedExtensions.contains(ext) else { throw HelperError.unsupportedType }
    libraryLock.lock()
    defer { libraryLock.unlock() }
    let lib = try library()
    let folder = lib.appendingPathComponent(try folderName(rawFolder), isDirectory: true)
    if (try? folder.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink) == true { throw HelperError.invalidFolder }
    if !fm.fileExists(atPath: folder.path) { try fm.createDirectory(at: folder, withIntermediateDirectories: false) }
    var index = readIndex(lib)
    let hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    if let existing = index.first(where: { $0.value["sha256"] as? String == hash && fm.fileExists(atPath: lib.appendingPathComponent($0.key).path) })?.key {
        return try send(["id": id, "type": "result", "ok": true, "path": libPrefix + existing, "duplicate": true])
    }
    let dest = freeURL(in: folder, name: "\(fileStem(rawName, fallback: "image")).\(ext)")
    let partial = folder.appendingPathComponent(".io-partial-\(UUID().uuidString).\(ext)")
    do {
        try data.write(to: partial)
        try fm.moveItem(at: partial, to: dest)
    } catch {
        try? fm.removeItem(at: partial)
        throw error
    }
    let key = try recordSaved(dest, in: lib, index: &index, size: data.count, hash: hash, tag: tag, comment: comment, from: from)
    try send(["id": id, "type": "result", "ok": true, "path": libPrefix + key])
}
