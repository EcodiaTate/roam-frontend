// ios/App/App/LocalFileServer.swift
//
// Lightweight local HTTP file server using Network.framework (zero dependencies).
// Serves static files from a root directory with:
//   ✅ Range request support (206 Partial Content) — required for PMTiles
//   ✅ CORS headers — required for WebView fetch()
//   ✅ Correct Content-Type for .pmtiles, .pbf, .json, .png, .svg
//   ✅ Localhost-only binding (127.0.0.1)
//
// Add this file directly to your Xcode project (ios/App/App/).

import Foundation
import Network

public class LocalFileServer {

    private let rootURL: URL
    private let requestedPort: UInt16
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "com.ecodia.roam.tileserver", qos: .userInitiated)

    public private(set) var isRunning = false
    public private(set) var actualPort: UInt16 = 0

    public init(rootURL: URL, port: UInt16 = 8765) {
        self.rootURL = rootURL.standardized
        self.requestedPort = port
    }

    /// Start the server. Returns the actual port bound.
    @discardableResult
    public func start() throws -> UInt16 {
        stop()

        let params = NWParameters.tcp
        // Bind to localhost only
        params.requiredLocalEndpoint = NWEndpoint.hostPort(
            host: NWEndpoint.Host("127.0.0.1"),
            port: NWEndpoint.Port(rawValue: requestedPort)!
        )

        let listener = try NWListener(using: params)

        listener.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                if let port = listener.port?.rawValue {
                    self?.actualPort = port
                    self?.isRunning = true
                    print("[LocalFileServer] ✅ Listening on http://127.0.0.1:\(port)")
                }
            case .failed(let error):
                print("[LocalFileServer] ❌ Failed: \(error)")
                self?.isRunning = false
            case .cancelled:
                self?.isRunning = false
            default:
                break
            }
        }

        listener.newConnectionHandler = { [weak self] connection in
            self?.handleConnection(connection)
        }

        self.listener = listener
        listener.start(queue: queue)

        // Wait briefly for the server to be ready
        let deadline = Date().addingTimeInterval(2.0)
        while !isRunning && Date() < deadline {
            Thread.sleep(forTimeInterval: 0.01)
        }

        guard isRunning else {
            throw NSError(
                domain: "LocalFileServer",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Server failed to start within timeout"]
            )
        }

        return actualPort
    }

    /// Stop the server.
    public func stop() {
        listener?.cancel()
        listener = nil
        isRunning = false
        actualPort = 0
    }

    // MARK: - Connection handling

    private func handleConnection(_ connection: NWConnection) {
        connection.start(queue: queue)

        // Read the HTTP request (up to 64KB should be more than enough for headers)
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, _, error in
            guard let self = self, let data = data, error == nil else {
                connection.cancel()
                return
            }
            self.processHTTPRequest(data, connection: connection)
        }
    }

    private func processHTTPRequest(_ data: Data, connection: NWConnection) {
        guard let request = String(data: data, encoding: .utf8) else {
            sendError(connection, status: 400, message: "Bad Request")
            return
        }

        let lines = request.components(separatedBy: "\r\n")
        guard let requestLine = lines.first else {
            sendError(connection, status: 400, message: "Bad Request")
            return
        }

        let parts = requestLine.split(separator: " ", maxSplits: 2)
        guard parts.count >= 2 else {
            sendError(connection, status: 400, message: "Bad Request")
            return
        }

        let method = String(parts[0])
        let rawPath = String(parts[1])

        // Handle OPTIONS (CORS preflight)
        if method == "OPTIONS" {
            sendCORSPreflight(connection)
            return
        }

        guard method == "GET" || method == "HEAD" else {
            sendError(connection, status: 405, message: "Method Not Allowed")
            return
        }

        // Parse path (strip query string)
        let path = rawPath.components(separatedBy: "?").first ?? rawPath
        let decoded = path.removingPercentEncoding ?? path

        // Resolve file URL safely
        let fileURL = rootURL.appendingPathComponent(decoded).standardized

        // Security: prevent directory traversal
        guard fileURL.path.hasPrefix(rootURL.path) else {
            sendError(connection, status: 403, message: "Forbidden")
            return
        }

        // Check file exists
        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: fileURL.path, isDirectory: &isDir),
              !isDir.boolValue else {
            sendError(connection, status: 404, message: "Not Found: \(decoded)")
            return
        }

        // Get file size
        guard let attrs = try? FileManager.default.attributesOfItem(atPath: fileURL.path),
              let fileSize = attrs[.size] as? UInt64 else {
            sendError(connection, status: 500, message: "Cannot stat file")
            return
        }

        // Parse Range header
        let rangeHeader = parseRangeHeader(from: lines, fileSize: fileSize)

        // Determine MIME type
        let contentType = mimeType(for: fileURL.pathExtension)

        if method == "HEAD" {
            sendHead(connection, contentType: contentType, fileSize: fileSize)
            return
        }

        if let range = rangeHeader {
            serveRangeRequest(connection, fileURL: fileURL, fileSize: fileSize, range: range, contentType: contentType)
        } else {
            serveFullFile(connection, fileURL: fileURL, fileSize: fileSize, contentType: contentType)
        }
    }

    // MARK: - Range parsing

    private struct ByteRange {
        let start: UInt64
        let end: UInt64 // inclusive
        var length: UInt64 { end - start + 1 }
    }

    private func parseRangeHeader(from lines: [String], fileSize: UInt64) -> ByteRange? {
        for line in lines {
            let lower = line.lowercased()
            if lower.hasPrefix("range:") {
                let value = line.dropFirst("range:".count).trimmingCharacters(in: .whitespaces)
                guard value.hasPrefix("bytes=") else { continue }
                let spec = value.dropFirst("bytes=".count)
                let parts = spec.split(separator: "-", maxSplits: 1)

                if parts.count == 2 {
                    let startStr = String(parts[0]).trimmingCharacters(in: .whitespaces)
                    let endStr = String(parts[1]).trimmingCharacters(in: .whitespaces)

                    if let start = UInt64(startStr) {
                        let end: UInt64
                        if endStr.isEmpty {
                            end = fileSize - 1
                        } else if let e = UInt64(endStr) {
                            end = min(e, fileSize - 1)
                        } else {
                            end = fileSize - 1
                        }
                        guard start <= end, start < fileSize else { return nil }
                        return ByteRange(start: start, end: end)
                    }
                } else if parts.count == 1 {
                    let startStr = String(parts[0]).trimmingCharacters(in: .whitespaces)
                    if let start = UInt64(startStr) {
                        guard start < fileSize else { return nil }
                        return ByteRange(start: start, end: fileSize - 1)
                    }
                }
            }
        }
        return nil
    }

    // MARK: - Response senders

    private func serveRangeRequest(
        _ connection: NWConnection,
        fileURL: URL,
        fileSize: UInt64,
        range: ByteRange,
        contentType: String
    ) {
        guard let handle = try? FileHandle(forReadingFrom: fileURL) else {
            sendError(connection, status: 500, message: "Cannot open file")
            return
        }

        handle.seek(toFileOffset: range.start)
        let chunk = handle.readData(ofLength: Int(range.length))
        try? handle.close()

        let header = [
            "HTTP/1.1 206 Partial Content",
            "Content-Type: \(contentType)",
            "Content-Length: \(chunk.count)",
            "Content-Range: bytes \(range.start)-\(range.end)/\(fileSize)",
            "Accept-Ranges: bytes",
            "Access-Control-Allow-Origin: *",
            "Access-Control-Allow-Methods: GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers: Range",
            "Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges",
            "Cache-Control: public, max-age=86400",
            "Connection: close",
            "",
            "",
        ].joined(separator: "\r\n")

        var response = Data(header.utf8)
        response.append(chunk)
        sendData(connection, data: response)
    }

    private func serveFullFile(
        _ connection: NWConnection,
        fileURL: URL,
        fileSize: UInt64,
        contentType: String
    ) {
        // For small files (< 10MB), read entirely
        // For large files, stream in chunks
        let maxInMemory: UInt64 = 10 * 1024 * 1024

        let header = [
            "HTTP/1.1 200 OK",
            "Content-Type: \(contentType)",
            "Content-Length: \(fileSize)",
            "Accept-Ranges: bytes",
            "Access-Control-Allow-Origin: *",
            "Access-Control-Allow-Methods: GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers: Range",
            "Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges",
            "Cache-Control: public, max-age=86400",
            "Connection: close",
            "",
            "",
        ].joined(separator: "\r\n")

        if fileSize <= maxInMemory {
            guard let body = try? Data(contentsOf: fileURL) else {
                sendError(connection, status: 500, message: "Cannot read file")
                return
            }
            var response = Data(header.utf8)
            response.append(body)
            sendData(connection, data: response)
        } else {
            // Stream large files: send header first, then chunks
            let headerData = Data(header.utf8)
            sendDataAndStreamFile(connection, headerData: headerData, fileURL: fileURL, fileSize: fileSize)
        }
    }

    private func sendHead(_ connection: NWConnection, contentType: String, fileSize: UInt64) {
        let header = [
            "HTTP/1.1 200 OK",
            "Content-Type: \(contentType)",
            "Content-Length: \(fileSize)",
            "Accept-Ranges: bytes",
            "Access-Control-Allow-Origin: *",
            "Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges",
            "Connection: close",
            "",
            "",
        ].joined(separator: "\r\n")
        sendData(connection, data: Data(header.utf8))
    }

    private func sendCORSPreflight(_ connection: NWConnection) {
        let header = [
            "HTTP/1.1 204 No Content",
            "Access-Control-Allow-Origin: *",
            "Access-Control-Allow-Methods: GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers: Range",
            "Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges",
            "Access-Control-Max-Age: 86400",
            "Connection: close",
            "",
            "",
        ].joined(separator: "\r\n")
        sendData(connection, data: Data(header.utf8))
    }

    private func sendError(_ connection: NWConnection, status: Int, message: String) {
        let body = "{\"error\":\"\(message)\"}"
        let header = [
            "HTTP/1.1 \(status) \(message)",
            "Content-Type: application/json",
            "Content-Length: \(body.utf8.count)",
            "Access-Control-Allow-Origin: *",
            "Connection: close",
            "",
            "",
        ].joined(separator: "\r\n")

        var data = Data(header.utf8)
        data.append(Data(body.utf8))
        sendData(connection, data: data)
    }

    // MARK: - Data sending

    private func sendData(_ connection: NWConnection, data: Data) {
        connection.send(content: data, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }

    private func sendDataAndStreamFile(
        _ connection: NWConnection,
        headerData: Data,
        fileURL: URL,
        fileSize: UInt64
    ) {
        // Send header first
        connection.send(content: headerData, completion: .contentProcessed { [weak self] error in
            if let error = error {
                print("[LocalFileServer] Header send error: \(error)")
                connection.cancel()
                return
            }
            self?.streamFileChunks(connection, fileURL: fileURL, offset: 0, remaining: fileSize)
        })
    }

    private func streamFileChunks(
        _ connection: NWConnection,
        fileURL: URL,
        offset: UInt64,
        remaining: UInt64
    ) {
        guard remaining > 0 else {
            connection.cancel()
            return
        }

        let chunkSize: UInt64 = 256 * 1024 // 256KB chunks
        let readSize = min(chunkSize, remaining)

        guard let handle = try? FileHandle(forReadingFrom: fileURL) else {
            connection.cancel()
            return
        }

        handle.seek(toFileOffset: offset)
        let chunk = handle.readData(ofLength: Int(readSize))
        try? handle.close()

        guard !chunk.isEmpty else {
            connection.cancel()
            return
        }

        connection.send(content: chunk, completion: .contentProcessed { [weak self] error in
            if let error = error {
                print("[LocalFileServer] Chunk send error: \(error)")
                connection.cancel()
                return
            }
            self?.streamFileChunks(
                connection,
                fileURL: fileURL,
                offset: offset + UInt64(chunk.count),
                remaining: remaining - UInt64(chunk.count)
            )
        })
    }

    // MARK: - MIME types

    private func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "pmtiles":             return "application/octet-stream"
        case "pbf":                 return "application/x-protobuf"
        case "json", "geojson":     return "application/json"
        case "png":                 return "image/png"
        case "jpg", "jpeg":         return "image/jpeg"
        case "webp":                return "image/webp"
        case "svg":                 return "image/svg+xml"
        case "css":                 return "text/css"
        case "js":                  return "application/javascript"
        case "html", "htm":         return "text/html"
        case "xml":                 return "application/xml"
        case "txt":                 return "text/plain"
        case "woff":                return "font/woff"
        case "woff2":               return "font/woff2"
        case "ttf":                 return "font/ttf"
        default:                    return "application/octet-stream"
        }
    }
}