// src/lib/native/index.ts

export { isNative, isWeb, isIOS, isAndroid, platform, hasPlugin } from "./platform";
export { useGeolocation, getCurrentPosition, requestLocationPermission, type RoamPosition } from "./geolocation";
export { configureStatusBar, hideStatusBar, showStatusBar } from "./statusBar";
export { useKeepAwake } from "./keepAwake";
export { nativeShare } from "./share";
export { notify, roamNotify, requestNotificationPermission, onNotificationTap, initNotificationTapListener } from "./notifications";
export { configureKeyboard, hideKeyboard } from "./keyboard";
export { lockPortrait, unlockOrientation } from "./orientation";
export { initAppLifecycle, onAppStateChange } from "./appLifecycle";
export { haptic } from "./haptics";
export { hideSplash, showSplash } from "./splash";
export { openInAppBrowser, closeInAppBrowser, onBrowserClosed } from "./browser";