// src/lib/native/keyboard.ts

import { isNative, hasPlugin, isIOS } from "./platform";

function isTextInput(
  el: Element | null,
): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) {
    const t = el.type;
    return (
      t === "text" ||
      t === "email" ||
      t === "password" ||
      t === "search" ||
      t === "tel" ||
      t === "url" ||
      t === "number" ||
      t === "date" ||
      t === "datetime-local" ||
      t === "time"
    );
  }
  if (el.getAttribute("contenteditable") === "true") return true;
  return false;
}

function scrollFocusedIntoView() {
  setTimeout(() => {
    const el = document.activeElement;
    if (!isTextInput(el)) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 250);
}

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

    // Let native scroll assist, but we also manually scroll below
    await Keyboard.setScroll({ isDisabled: false });

    let keyboardVisible = false;

    // Use keyboardWillShow for CSS class + height variable (instant visual response)
    await Keyboard.addListener("keyboardWillShow", (info) => {
      document.documentElement.style.setProperty(
        "--roam-keyboard-h",
        `${info.keyboardHeight}px`,
      );
      document.documentElement.classList.add("keyboard-open");
    });

    // Use keyboardDidShow for scrolling — body resize is complete by this point
    await Keyboard.addListener("keyboardDidShow", () => {
      keyboardVisible = true;
      scrollFocusedIntoView();
    });

    await Keyboard.addListener("keyboardWillHide", () => {
      document.documentElement.style.setProperty("--roam-keyboard-h", "0px");
      document.documentElement.classList.remove("keyboard-open");
    });

    await Keyboard.addListener("keyboardDidHide", () => {
      keyboardVisible = false;
    });

    // Handle focus changes while keyboard is already open
    document.addEventListener(
      "focusin",
      (e: FocusEvent) => {
        if (!keyboardVisible) return;
        if (!isTextInput(e.target as Element)) return;
        setTimeout(() => {
          (e.target as HTMLElement).scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }, 150);
      },
      { passive: true },
    );
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
