import Foundation
import Capacitor
import CryptoKit
import Security

@objc(TcbVaultPlugin)
public class TcbVaultPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TcbVaultPlugin"
    public let jsName = "TcbVault"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise)
    ]
    private static let queue = DispatchQueue(label: "mx.todocerca.tcb.vault")
    private let magic = Data([84, 67, 66, 0, 1])
    private let maxSafe: UInt64 = 9007199254740991
    private enum Failure: Error { case invalid }

    private func identity(_ call: CAPPluginCall) throws -> (String, String) {
        var localOrigin = false
        DispatchQueue.main.sync {
            localOrigin = ["localhost", "127.0.0.1"].contains(self.bridge?.webView?.url?.host ?? "")
        }
        guard localOrigin else { throw Failure.invalid }
        guard let scope = call.getString("scope"), let card = call.getString("cardId"),
              scope.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil,
              card.range(of: "^[0-9]{16}$", options: .regularExpression) != nil else { throw Failure.invalid }
        return (scope, card)
    }

    private func file(_ scope: String, _ card: String) throws -> URL {
        let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        var directory = root.appendingPathComponent("tcb").appendingPathComponent(scope)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
                                               attributes: [.protectionKey: FileProtectionType.complete])
        var flags = URLResourceValues()
        flags.isExcludedFromBackup = true
        try directory.setResourceValues(flags)
        return directory.appendingPathComponent(card + ".tcb")
    }

    private func key(_ scope: String, _ card: String, create: Bool) throws -> SymmetricKey {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "mx.todocerca.tcb", kSecAttrAccount as String: scope + "." + card,
            kSecAttrSynchronizable as String: false]
        var lookup = query
        lookup[kSecReturnData as String] = true
        lookup[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(lookup as CFDictionary, &result)
        if status == errSecSuccess, let bytes = result as? Data, bytes.count == 32 { return SymmetricKey(data: bytes) }
        guard status == errSecItemNotFound, create else { throw Failure.invalid }
        var bytes = Data(count: 32)
        let randomStatus = bytes.withUnsafeMutableBytes { buffer in
            guard let address = buffer.baseAddress else { return errSecParam }
            return SecRandomCopyBytes(kSecRandomDefault, 32, address)
        }
        guard randomStatus == errSecSuccess else { throw Failure.invalid }
        var insert = query
        insert[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        insert[kSecValueData as String] = bytes
        guard SecItemAdd(insert as CFDictionary, nil) == errSecSuccess else { throw Failure.invalid }
        // Key exists in native process memory, never the JavaScript bridge. This is not Secure Enclave AES.
        return SymmetricKey(data: bytes)
    }

    private func integer(_ value: Data, _ offset: Int) -> UInt64 {
        value[offset..<(offset + 8)].reduce(UInt64(0)) { ($0 << 8) | UInt64($1) }
    }

    private func content(_ value: Data, _ card: String) throws -> Data {
        guard value.count == 106, value[0] == 0, value[1] == 1,
              String(data: value.subdata(in: 2..<18), encoding: .ascii) == card,
              [18, 26, 34].allSatisfy({ integer(value, $0) <= maxSafe }),
              (integer(value, 34) == 0) == (value.subdata(in: 42..<74) == Data(count: 32)),
              Data(SHA256.hash(data: value.prefix(74))) == value.subdata(in: 74..<106) else { throw Failure.invalid }
        return value
    }

    private func hash(_ value: Data) -> String {
        value[74..<106].map { String(format: "%02x", $0) }.joined()
    }

    private func load(_ target: URL, _ secret: SymmetricKey, _ card: String) throws -> Data {
        let envelope = try Data(contentsOf: target)
        guard envelope.count == 139, envelope.prefix(5) == magic else { throw Failure.invalid }
        let sealed = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: envelope.subdata(in: 5..<17)),
            ciphertext: envelope.subdata(in: 17..<123), tag: envelope.subdata(in: 123..<139))
        return try content(AES.GCM.open(sealed, using: secret, authenticating: envelope.prefix(17)), card)
    }

    @objc func read(_ call: CAPPluginCall) {
        Self.queue.async {
            do {
                let (scope, card) = try self.identity(call)
                let target = try self.file(scope, card)
                guard FileManager.default.fileExists(atPath: target.path) else { call.resolve(["payload": NSNull()]); return }
                let payload = try self.load(target, self.key(scope, card, create: false), card)
                call.resolve(["payload": payload.base64EncodedString()])
            } catch { call.reject("TCB_VAULT_READ_FAILED") }
        }
    }

    @objc func write(_ call: CAPPluginCall) {
        Self.queue.async {
            do {
                let (scope, card) = try self.identity(call)
                guard let encoded = call.getString("payload"), encoded.count == 144,
                      let bytes = Data(base64Encoded: encoded) else { throw Failure.invalid }
                let payload = try self.content(bytes, card)
                var target = try self.file(scope, card)
                let exists = FileManager.default.fileExists(atPath: target.path)
                let secret = try self.key(scope, card, create: !exists)
                let expected = call.getString("expectedHash")
                if exists {
                    let prior = try self.load(target, secret, card)
                    guard self.hash(prior) == expected else { throw Failure.invalid }
                    if prior == payload { call.resolve(); return }
                    guard self.integer(prior, 34) < self.maxSafe,
                          self.integer(payload, 34) == self.integer(prior, 34) + 1,
                          self.integer(payload, 26) >= self.integer(prior, 26),
                          payload.subdata(in: 42..<74) == prior.subdata(in: 74..<106) else { throw Failure.invalid }
                } else if expected != nil || self.integer(payload, 34) != 0 { throw Failure.invalid }
                let nonce = AES.GCM.Nonce()
                var header = self.magic
                header.append(nonce.withUnsafeBytes { Data($0) })
                let sealed = try AES.GCM.seal(payload, using: secret, nonce: nonce, authenticating: header)
                var envelope = header
                envelope.append(sealed.ciphertext)
                envelope.append(sealed.tag)
                try envelope.write(to: target, options: [.atomic, .completeFileProtection])
                var flags = URLResourceValues()
                flags.isExcludedFromBackup = true
                try target.setResourceValues(flags)
                guard try self.load(target, secret, card) == payload else { throw Failure.invalid }
                call.resolve()
            } catch { call.reject("TCB_VAULT_WRITE_FAILED") }
        }
    }
}