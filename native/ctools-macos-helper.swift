import AppKit
import Foundation
import Security

enum HelperFailure: Error, CustomStringConvertible {
    case usage(String)
    case osStatus(OSStatus)
    case missingApplication(String)
    case applicationWouldNotQuit(String)

    var description: String {
        switch self {
        case .usage(let message):
            return message
        case .osStatus(let status):
            let message = SecCopyErrorMessageString(status, nil) as String? ?? "Unknown Keychain error"
            return "Keychain error \(status): \(message)"
        case .missingApplication(let bundleIdentifier):
            return "Application not found: \(bundleIdentifier)"
        case .applicationWouldNotQuit(let bundleIdentifier):
            return "Application did not quit normally: \(bundleIdentifier)"
        }
    }
}

func baseQuery(service: String, account: String) -> [CFString: Any] {
    [
        kSecClass: kSecClassGenericPassword,
        kSecAttrService: service,
        kSecAttrAccount: account,
    ]
}

func storeSecret(service: String, account: String) throws {
    let secret = FileHandle.standardInput.readDataToEndOfFile()
    guard !secret.isEmpty else {
        throw HelperFailure.usage("Secret input is empty")
    }

    let query = baseQuery(service: service, account: account)
    let status = SecItemUpdate(query as CFDictionary, [kSecValueData: secret] as CFDictionary)

    if status == errSecSuccess {
        return
    }
    guard status == errSecItemNotFound else {
        throw HelperFailure.osStatus(status)
    }

    var item = query
    item[kSecValueData] = secret
    item[kSecAttrAccessible] = kSecAttrAccessibleAfterFirstUnlock
    let addStatus = SecItemAdd(item as CFDictionary, nil)
    guard addStatus == errSecSuccess else {
        throw HelperFailure.osStatus(addStatus)
    }
}

func readSecret(service: String, account: String) throws {
    var query = baseQuery(service: service, account: account)
    query[kSecReturnData] = true
    query[kSecMatchLimit] = kSecMatchLimitOne

    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    guard status == errSecSuccess, let data = result as? Data else {
        throw HelperFailure.osStatus(status)
    }
    FileHandle.standardOutput.write(data)
}

func deleteSecret(service: String, account: String) throws {
    let status = SecItemDelete(baseQuery(service: service, account: account) as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
        throw HelperFailure.osStatus(status)
    }
}

func runningApplications(bundleIdentifier: String) -> [NSRunningApplication] {
    NSRunningApplication.runningApplications(withBundleIdentifier: bundleIdentifier)
}

func printApplicationStatus(bundleIdentifier: String) {
    print(runningApplications(bundleIdentifier: bundleIdentifier).isEmpty ? "stopped" : "running")
}

func terminateApplication(bundleIdentifier: String) throws {
    let applications = runningApplications(bundleIdentifier: bundleIdentifier)
    if applications.isEmpty {
        return
    }

    for application in applications {
        _ = application.terminate()
    }

    let deadline = Date().addingTimeInterval(10)
    while Date() < deadline {
        if runningApplications(bundleIdentifier: bundleIdentifier).isEmpty {
            return
        }
        Thread.sleep(forTimeInterval: 0.2)
    }

    throw HelperFailure.applicationWouldNotQuit(bundleIdentifier)
}

func requireArguments(_ args: [String], count: Int, usage: String) throws {
    guard args.count == count else {
        throw HelperFailure.usage(usage)
    }
}

do {
    let args = Array(CommandLine.arguments.dropFirst())
    guard let command = args.first else {
        throw HelperFailure.usage("Expected a command")
    }

    switch command {
    case "keychain-set":
        try requireArguments(args, count: 3, usage: "keychain-set <service> <account>")
        try storeSecret(service: args[1], account: args[2])
    case "keychain-get":
        try requireArguments(args, count: 3, usage: "keychain-get <service> <account>")
        try readSecret(service: args[1], account: args[2])
    case "keychain-delete":
        try requireArguments(args, count: 3, usage: "keychain-delete <service> <account>")
        try deleteSecret(service: args[1], account: args[2])
    case "app-status":
        try requireArguments(args, count: 2, usage: "app-status <bundle-identifier>")
        printApplicationStatus(bundleIdentifier: args[1])
    case "app-terminate":
        try requireArguments(args, count: 2, usage: "app-terminate <bundle-identifier>")
        try terminateApplication(bundleIdentifier: args[1])
    default:
        throw HelperFailure.usage("Unknown command: \(command)")
    }
} catch {
    FileHandle.standardError.write(Data("\(error)\n".utf8))
    exit(1)
}
