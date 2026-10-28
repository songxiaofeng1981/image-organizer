// main.swift: routes each request to its part (Manage, PictureSave, VideoSave, Library) and runs the
// read loop. Only this file may run code at the top level.
// main.swift：把每个请求交给对应的部分，并运行读取循环。只有这个文件能在顶层直接运行代码。

import Foundation

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
        case "save": try save(id: id, data: request["data"] as? String ?? "", name: request["name"] as? String ?? "",
                              folder: request["folder"] as? String ?? "", tag: request["tag"] as? [String: Any],
                              comment: request["comment"] as? String, from: request["from"] as? [String] ?? [])
        case "videoBegin": try videoBegin(id: id, size: request["size"] as? Int ?? 0)
        case "videoChunk": try videoChunk(id: id, token: request["token"] as? String ?? "", offset: request["offset"] as? Int ?? -1,
                                          data: request["data"] as? String ?? "")
        case "videoFinish": try videoFinish(id: id, token: request["token"] as? String ?? "", name: request["name"] as? String ?? "",
                                            folder: request["folder"] as? String ?? "", tag: request["tag"] as? [String: Any],
                                            comment: request["comment"] as? String, from: request["from"] as? [String] ?? [])
        case "videoCancel": try videoCancel(id: id, token: request["token"] as? String ?? "")
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
    // Pictures saved from web pages arrive as base64, so requests may be large. / 网页图片以 base64 发来，请求可能较大。
    guard length > 0, length <= 96 * 1024 * 1024, let body = readExactly(Int(length)) else { break }
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
