// ios/App/App/RoamTileServerPlugin.swift
//
// Capacitor plugin for RoamTileServer.
// Manages a local HTTP file server with Range/206 support
// and handles large file downloads (PMTiles) to device storage.
//
// Add this file directly to your Xcode project (ios/App/App/).

import Foundation
import Capacitor

@objc(RoamTileServerPlugin)
public class RoamTileServerPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "RoamTileServerPlugin"
    public let jsName = "RoamTileServer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startServer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopServer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getServerStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "downloadFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelDownload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getBasemapInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteBasemap", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getBasemapsRoot", returnType: CAPPluginReturnPromise),
    ]

    private var fileServer: LocalFileServer?
    private var activeDownloads: [String: URLSessionDownloadTask] = [:]
    private var downloadSessions: [String: URLSession] = [:]
    private var downloadDelegates: [String: DownloadDelegate] = [:]

    // MARK: - Basemaps root directory

    private var basemapsRoot: URL {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        return docs.appendingPathComponent("roam/basemaps", isDirectory: true)
    }

    private func ensureDirectory(_ url: URL) throws {
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    }

    // MARK: - Server lifecycle

    @objc func startServer(_ call: CAPPluginCall) {
        let rootPath = call.getString("rootPath") ?? basemapsRoot.path
        let port = call.getInt("port").map { UInt16($0) } ?? 8765
        let rootURL = URL(fileURLWithPath: rootPath, isDirectory: true)

        guard FileManager.default.fileExists(atPath: rootPath) else {
            call.reject("Root path does not exist: \(rootPath)")
            return
        }

        // Stop existing server if running
        fileServer?.stop()

        let server = LocalFileServer(rootURL: rootURL, port: port)
        do {
            let actualPort = try server.start()
            self.fileServer = server
            let url = "http://127.0.0.1:\(actualPort)"
            call.resolve(["url": url, "port": Int(actualPort)])
        } catch {
            call.reject("Failed to start server: \(error.localizedDescription)")
        }
    }

    @objc func stopServer(_ call: CAPPluginCall) {
        fileServer?.stop()
        fileServer = nil
        call.resolve()
    }

    @objc func getServerStatus(_ call: CAPPluginCall) {
        let running = fileServer?.isRunning ?? false
        let port = fileServer?.actualPort ?? 0
        let url: Any = running ? "http://127.0.0.1:\(port)" as Any : NSNull()
        call.resolve([
            "running": running,
            "url": url,
            "port": Int(port),
        ])
    }

    // MARK: - File download

    @objc func downloadFile(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"),
              let url = URL(string: urlString) else {
            call.reject("Invalid download URL")
            return
        }

        let region = call.getString("region") ?? "australia"
        let filename = call.getString("filename") ?? url.lastPathComponent
        let sha256 = call.getString("sha256")

        let regionDir = basemapsRoot.appendingPathComponent(region, isDirectory: true)
        let destFile = regionDir.appendingPathComponent(filename)

        // Ensure directory exists
        do {
            try ensureDirectory(regionDir)
        } catch {
            call.reject("Cannot create directory: \(error.localizedDescription)")
            return
        }

        // Remove existing file if present
        try? FileManager.default.removeItem(at: destFile)

        // Create download delegate for progress
        let delegate = DownloadDelegate(
            region: region,
            destURL: destFile,
            sha256Expected: sha256,
            onProgress: { [weak self] received, total in
                let progress = total > 0 ? Double(received) / Double(total) : -1.0
                self?.notifyListeners("downloadProgress", data: [
                    "region": region,
                    "bytesReceived": received,
                    "bytesTotal": total,
                    "progress": progress,
                ])
            },
            onComplete: { [weak self] result in
                self?.activeDownloads.removeValue(forKey: region)
                self?.downloadSessions.removeValue(forKey: region)
                self?.downloadDelegates.removeValue(forKey: region)

                switch result {
                case .success(let info):
                    call.resolve([
                        "path": info.path,
                        "bytes": info.bytes,
                        "verified": info.verified as Any,
                    ])
                case .failure(let error):
                    call.reject("Download failed: \(error.localizedDescription)")
                }
            }
        )

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForResource = 7200 // 2 hours for large files
        config.httpMaximumConnectionsPerHost = 1
        let session = URLSession(configuration: config, delegate: delegate, delegateQueue: nil)

        let task = session.downloadTask(with: url)
        activeDownloads[region] = task
        downloadSessions[region] = session
        downloadDelegates[region] = delegate
        task.resume()
    }

    @objc func cancelDownload(_ call: CAPPluginCall) {
        let region = call.getString("region") ?? "australia"
        activeDownloads[region]?.cancel()
        activeDownloads.removeValue(forKey: region)
        downloadSessions[region]?.invalidateAndCancel()
        downloadSessions.removeValue(forKey: region)
        downloadDelegates.removeValue(forKey: region)
        call.resolve()
    }

    // MARK: - Basemap info

    @objc func getBasemapInfo(_ call: CAPPluginCall) {
        let region = call.getString("region") ?? "australia"
        let regionDir = basemapsRoot.appendingPathComponent(region, isDirectory: true)

        guard FileManager.default.fileExists(atPath: regionDir.path) else {
            call.resolve([
                "installed": false,
                "path": regionDir.path,
                "sizeBytes": 0,
                "files": [] as [String],
            ])
            return
        }

        var totalSize: Int64 = 0
        var files: [String] = []

        if let enumerator = FileManager.default.enumerator(
            at: regionDir,
            includingPropertiesForKeys: [.fileSizeKey, .isRegularFileKey],
            options: [.skipsHiddenFiles]
        ) {
            for case let fileURL as URL in enumerator {
                let values = try? fileURL.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
                if values?.isRegularFile == true {
                    totalSize += Int64(values?.fileSize ?? 0)
                    files.append(fileURL.lastPathComponent)
                }
            }
        }

        let installed = files.contains { $0.hasSuffix(".pmtiles") }

        call.resolve([
            "installed": installed,
            "path": regionDir.path,
            "sizeBytes": totalSize,
            "files": files,
        ])
    }

    @objc func deleteBasemap(_ call: CAPPluginCall) {
        let region = call.getString("region") ?? "australia"
        let regionDir = basemapsRoot.appendingPathComponent(region, isDirectory: true)

        // Cancel any active download first
        activeDownloads[region]?.cancel()
        activeDownloads.removeValue(forKey: region)

        do {
            if FileManager.default.fileExists(atPath: regionDir.path) {
                try FileManager.default.removeItem(at: regionDir)
            }
            call.resolve()
        } catch {
            call.reject("Failed to delete basemap: \(error.localizedDescription)")
        }
    }

    @objc func getBasemapsRoot(_ call: CAPPluginCall) {
        do {
            try ensureDirectory(basemapsRoot)
        } catch {
            call.reject("Cannot create basemaps directory: \(error.localizedDescription)")
            return
        }
        call.resolve(["path": basemapsRoot.path])
    }
}

// MARK: - Download delegate

private struct DownloadInfo {
    let path: String
    let bytes: Int
    let verified: Bool?
}

private class DownloadDelegate: NSObject, URLSessionDownloadDelegate {
    let region: String
    let destURL: URL
    let sha256Expected: String?
    let onProgress: (Int64, Int64) -> Void
    let onComplete: (Result<DownloadInfo, Error>) -> Void

    init(
        region: String,
        destURL: URL,
        sha256Expected: String?,
        onProgress: @escaping (Int64, Int64) -> Void,
        onComplete: @escaping (Result<DownloadInfo, Error>) -> Void
    ) {
        self.region = region
        self.destURL = destURL
        self.sha256Expected = sha256Expected
        self.onProgress = onProgress
        self.onComplete = onComplete
    }

    func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didFinishDownloadingTo location: URL
    ) {
        do {
            // Move downloaded file to destination
            try? FileManager.default.removeItem(at: destURL)
            try FileManager.default.moveItem(at: location, to: destURL)

            let attrs = try FileManager.default.attributesOfItem(atPath: destURL.path)
            let size = (attrs[.size] as? Int) ?? 0

            // SHA-256 verification if expected hash provided
            var verified: Bool? = nil
            if let expected = sha256Expected, !expected.isEmpty {
                let actual = sha256OfFile(destURL)
                verified = actual?.lowercased() == expected.lowercased()
                if verified == false {
                    try? FileManager.default.removeItem(at: destURL)
                    onComplete(.failure(NSError(
                        domain: "RoamTileServer",
                        code: 1,
                        userInfo: [NSLocalizedDescriptionKey: "SHA-256 mismatch: expected \(expected), got \(actual ?? "nil")"]
                    )))
                    return
                }
            }

            onComplete(.success(DownloadInfo(path: destURL.path, bytes: size, verified: verified)))
        } catch {
            onComplete(.failure(error))
        }
    }

    func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didWriteData bytesWritten: Int64,
        totalBytesWritten: Int64,
        totalBytesExpectedToWrite: Int64
    ) {
        onProgress(totalBytesWritten, totalBytesExpectedToWrite)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error {
            // Only report if not cancelled
            if (error as NSError).code != NSURLErrorCancelled {
                onComplete(.failure(error))
            }
        }
    }

    /// Compute SHA-256 of file using CommonCrypto
    private func sha256OfFile(_ url: URL) -> String? {
        guard let handle = try? FileHandle(forReadingFrom: url) else { return nil }
        defer { handle.closeFile() }

        var context = CC_SHA256_CTX()
        CC_SHA256_Init(&context)

        let bufferSize = 1024 * 1024 // 1MB chunks
        while autoreleasepool(invoking: {
            let data = handle.readData(ofLength: bufferSize)
            if data.isEmpty { return false }
            data.withUnsafeBytes { ptr in
                _ = CC_SHA256_Update(&context, ptr.baseAddress, CC_LONG(data.count))
            }
            return true
        }) {}

        var digest = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        CC_SHA256_Final(&digest, &context)
        return digest.map { String(format: "%02x", $0) }.joined()
    }
}

// Need to import CommonCrypto for SHA-256
import CommonCrypto