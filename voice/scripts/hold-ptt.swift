// Holds Option+Control (VoiceOS push-to-talk chord) for N ms, posting at the
// HID event tap with a hidSystemState source — the most hardware-like synthetic
// input macOS offers. AppleScript/System Events posts at session level, which
// VoiceOS's chord listener ignores; this path is what event taps actually see.
// Atomic by design: down → sleep → up in one process, so keys always release.
//   usage: hold-ptt [milliseconds]   (default 6000)

import CoreGraphics
import Foundation

let ms = CommandLine.arguments.count > 1 ? (Double(CommandLine.arguments[1]) ?? 6000) : 6000
let src = CGEventSource(stateID: .hidSystemState)

let OPTION: CGKeyCode = 58 // left option
let CONTROL: CGKeyCode = 59 // left control

func post(_ key: CGKeyCode, down: Bool, flags: CGEventFlags) {
    guard let e = CGEvent(keyboardEventSource: src, virtualKey: key, keyDown: down) else { return }
    e.flags = flags
    e.post(tap: .cghidEventTap)
}

post(OPTION, down: true, flags: [.maskAlternate])
post(CONTROL, down: true, flags: [.maskAlternate, .maskControl])
Thread.sleep(forTimeInterval: ms / 1000.0)
post(CONTROL, down: false, flags: [.maskAlternate])
post(OPTION, down: false, flags: [])
