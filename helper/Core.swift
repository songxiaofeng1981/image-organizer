// Image Organizer helper / 图片整理本机助手
//
// Chrome starts this program through Native Messaging when the gallery page opens,
// and it exits when the page closes. It only ever touches image files inside
// ~/Downloads and in the picture library the user chose: list them, read them, make thumbnails,
// file them into the library, move them to the Trash.
//
// Chrome 打开图库页时通过 Native Messaging 启动本程序，页面关闭时退出。
// 它只处理 ~/Downloads 和用户选定的图片库里的图片：列出、读取、生成缩略图、归入图片库、移到废纸篓。

// Core.swift: shared by every part: constants, errors, Native Messaging framing, the path gate resolve().
// Core.swift：各部分共用：常量、错误、Native Messaging 收发、路径把关 resolve()。

import CryptoKit
import Foundation
import ImageIO
import UniformTypeIdentifiers

let helperVersion = "2.5.0"
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
