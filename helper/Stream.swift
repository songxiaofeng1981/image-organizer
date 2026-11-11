// Stream.swift: playing a video inside the gallery page. Chrome refuses file:// video in extension pages, but plays
// http://127.0.0.1, so the helper serves the videos the page asked to play (`playURL`) from a tiny HTTP server:
// only on 127.0.0.1, on a port the system picks, started on the first `playURL`, gone when the helper exits (when
// the gallery closes). Every address carries a random token made at start; there are no file paths in it, only
// numbers the helper handed out for paths that passed resolve(). GET and HEAD only, with Range (for seeking).
// Read-only. The same approach as VideoLib's stream.py (songxiaofeng1981/videolib, docs/PROTOCOL.md section 6).
//
// Stream.swift：在图库页面里播放视频。Chrome 不许插件页面播放 file:// 视频，但能播 http://127.0.0.1，所以助手用一个
// 很小的 HTTP 服务提供页面要播放的视频（`playURL`）：只监听 127.0.0.1，端口由系统分配，第一次 `playURL` 时才开，
// 助手退出（关掉图库）时就没了。每个地址都带启动时随机生成的口令；地址里没有文件路径，只有助手为通过 resolve()
// 检查的路径分配的编号。只支持 GET 和 HEAD，支持 Range（拖进度条）。只读。做法和 VideoLib 的 stream.py 相同。

import Foundation
import Network

final class StreamServer {
    static let shared = StreamServer()

    private let token: String = {
        var bytes = [UInt8](repeating: 0, count: 18)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes).base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }()
    private let lock = NSLock()
    private var listener: NWListener?
    private var port: UInt16 = 0
    private var files: [Int: URL] = [:]   // number in the address → video / 地址里的编号 → 视频
    private var numbers: [String: Int] = [:]
    private let queue = DispatchQueue(label: "stream", attributes: .concurrent)

    /// Allows this video and returns its address, starting the server the first time.
    /// 登记这个视频并返回它的地址；第一次调用时开启服务。
    func url(for file: URL) throws -> String {
        lock.lock()
        defer { lock.unlock() }
        let n = numbers[file.path] ?? files.count + 1
        numbers[file.path] = n
        files[n] = file
        if listener == nil { try start() }
        return "http://127.0.0.1:\(port)/v/\(token)/\(n)"
    }

    private func start() throws {
        let parameters = NWParameters.tcp
        parameters.requiredInterfaceType = .loopback
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
        let l = try NWListener(using: parameters)
        let ready = DispatchSemaphore(value: 0)
        var failed: NWError?
        l.stateUpdateHandler = { state in
            switch state {
            case .ready: ready.signal()
            case .failed(let e): failed = e; ready.signal()
            default: break
            }
        }
        l.newConnectionHandler = { [weak self] c in self?.accept(c) }
        l.start(queue: queue)
        guard ready.wait(timeout: .now() + 5) == .success, failed == nil, let p = l.port?.rawValue else {
            l.cancel()
            throw HelperError.streamFailed
        }
        listener = l
        port = p
    }

    private func file(_ number: Int) -> URL? {
        lock.lock()
        defer { lock.unlock() }
        return files[number]
    }

    // MARK: - One request per connection / 每个连接一个请求

    private func accept(_ c: NWConnection) {
        c.start(queue: DispatchQueue(label: "stream.connection"))
        readHead(c, Data())
    }

    private func readHead(_ c: NWConnection, _ buffer: Data) {
        c.receive(minimumIncompleteLength: 1, maximumLength: 16 * 1024) { [weak self] data, _, done, error in
            guard let self, error == nil else { return c.cancel() }
            var head = buffer
            if let data { head.append(data) }
            if let end = head.range(of: Data("\r\n\r\n".utf8)) {
                self.answer(c, String(decoding: head[..<end.lowerBound], as: UTF8.self))
            } else if done || head.count > 16 * 1024 {
                c.cancel()
            } else {
                self.readHead(c, head)
            }
        }
    }

    private func answer(_ c: NWConnection, _ head: String) {
        let lines = head.components(separatedBy: "\r\n")
        let request = lines.first?.split(separator: " ").map(String.init) ?? []
        guard request.count >= 2, request[0] == "GET" || request[0] == "HEAD" else { return status(c, 405, "Method Not Allowed") }
        // /v/<token>/<number>
        let parts = request[1].split(separator: "?").first.map { $0.split(separator: "/", omittingEmptySubsequences: false) } ?? []
        guard parts.count == 4, parts[1] == "v", constantTimeEqual(String(parts[2]), token) else { return status(c, 403, "Forbidden") }
        guard let n = Int(parts[3]), let url = file(n),
              (try? url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true,
              let handle = try? FileHandle(forReadingFrom: url) else { return status(c, 404, "Not Found") }
        let size = Int((try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
        var start = 0, end = size - 1, partial = false
        if let range = lines.dropFirst().first(where: { $0.lowercased().hasPrefix("range:") }) {
            let spec = range.dropFirst(6).trimmingCharacters(in: .whitespaces)
            if spec.hasPrefix("bytes=") {
                let first = spec.dropFirst(6).split(separator: ",").first.map(String.init) ?? ""
                let ab = first.split(separator: "-", maxSplits: 1, omittingEmptySubsequences: false).map { $0.trimmingCharacters(in: .whitespaces) }
                if ab.count == 2, let a = Int(ab[0]) {
                    start = a
                    if let b = Int(ab[1]) { end = min(b, size - 1) }
                } else if ab.count == 2, ab[0].isEmpty, let b = Int(ab[1]) {
                    start = max(0, size - b)
                } else {
                    start = size
                }
                partial = true
                if start > end || start >= size {
                    try? handle.close()
                    return send(c, "HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */\(size)\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                }
            }
        }
        let length = end - start + 1
        var header = partial ? "HTTP/1.1 206 Partial Content\r\nContent-Range: bytes \(start)-\(end)/\(size)\r\n" : "HTTP/1.1 200 OK\r\n"
        // MP4, M4V and MOV are the same container; Chrome plays QuickTime files only as video/mp4.
        // MP4、M4V、MOV 是同一种容器；Chrome 只按 video/mp4 播放 QuickTime 文件。
        header += "Content-Type: video/mp4\r\nAccept-Ranges: bytes\r\nContent-Length: \(length)\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n"
        guard request[0] == "GET", length > 0 else {
            try? handle.close()
            return send(c, header)
        }
        do { try handle.seek(toOffset: UInt64(start)) } catch {
            try? handle.close()
            return c.cancel()
        }
        c.send(content: Data(header.utf8), completion: .contentProcessed { [weak self] error in
            guard error == nil else { try? handle.close(); return c.cancel() }
            self?.pump(c, handle, left: length)
        })
    }

    /// Sends the file one piece at a time; stops when the player drops the request (after a seek).
    /// 一块一块地发送文件；播放器放弃这个请求时（拖动之后）就停。
    private func pump(_ c: NWConnection, _ handle: FileHandle, left: Int) {
        let piece = (try? handle.read(upToCount: min(1 << 20, left))) ?? Data()
        guard !piece.isEmpty else {
            try? handle.close()
            return c.cancel()
        }
        let rest = left - piece.count
        c.send(content: piece, completion: .contentProcessed { [weak self] error in
            if error != nil || rest <= 0 {
                try? handle.close()
                return c.cancel()
            }
            self?.pump(c, handle, left: rest)
        })
    }

    private func status(_ c: NWConnection, _ code: Int, _ text: String) {
        send(c, "HTTP/1.1 \(code) \(text)\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
    }

    private func send(_ c: NWConnection, _ text: String) {
        c.send(content: Data(text.utf8), completion: .contentProcessed { _ in c.cancel() })
    }
}

private func constantTimeEqual(_ a: String, _ b: String) -> Bool {
    let x = Array(a.utf8), y = Array(b.utf8)
    guard x.count == y.count else { return false }
    return zip(x, y).reduce(0) { $0 | ($1.0 ^ $1.1) } == 0
}

/// The address the page plays a video from (`<video src>`). Only videos that pass resolve().
/// 页面播放视频用的地址（`<video src>`）。只接受通过 resolve() 检查的视频。
func playURL(id: String, path: String) throws {
    let url = try resolve(path)
    guard isVideo(url) else { throw HelperError.unsupportedType }
    try send(["id": id, "type": "result", "ok": true, "url": try StreamServer.shared.url(for: url)])
}
