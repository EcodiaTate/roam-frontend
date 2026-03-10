// src/lib/native/keyboard.ts
"use client";

import { isNative, hasPlugin, isIOS } from "./platform";

/**
 * Configure keyboard behavior for mobile-first UX.
 *
 * - iOS: keyboard pushes content up (accessoryBarVisible for done button)
 * - Android: resize mode so content scrolls naturally
 * - Scroll active input into view when keyboard opens
 *
 * Call once at app boot.
 */
export async function configureKeyboard(): Promise<void> {
  if (!isNative || !hasPlugin("Keyboard")) return;

  try {
    const { Keyboard, KeyboardResize } = await import("@capacitor/keyboard");

    // iOS: show the "Done" bar above keyboard for dismissal
    if (isIOS) {
      await Keyboard.setAccessoryBarVisible({ isVisible: true });
    }

    // Resize behavior: "body" mode resizes the WebView so content
    // scrolls naturally without manual offset calculations.
    await Keyboard.setResizeMode({ mode: KeyboardResize.Body });

    // Scroll focused input into view when keyboard opens
    await Keyboard.setScroll({ isDisabled: false });

    // Optional: listen for keyboard events to add CSS class
    await Keyboard.addListener("keyboardWillShow", (info) => {
      document.documentElement.style.setProperty(
        "--roam-keyboard-h",
        `${info.keyboardHeight}px`,
      );
      document.documentElement.classList.add("keyboard-open");
    });

    await Keyboard.addListener("keyboardWillHide", () => {
      document.documentElement.style.setProperty("--roam-keyboard-h", "0px");
      document.documentElement.classList.remove("keyboard-open");
    });
  } catch (e) {
    console.warn("[Keyboard] config failed", e);
  }
}

/**
 * Programmatically hide the keyboard.
 */
export async function hideKeyboard(): Promise<void> {
  if (!isNative || !hasPlugin("Keyboard")) return;
  try {
    const { Keyboard } = await import("@capacitor/keyboard");
    await Keyboard.hide();
  } catch {}
}