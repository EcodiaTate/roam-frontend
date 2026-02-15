#!/usr/bin/env bash
# Run this from your frontend root directory

npm install \
  @capacitor/geolocation \
  @capacitor/network \
  @capacitor/app \
  @capacitor/status-bar \
  @capacitor/splash-screen \
  @capacitor/keyboard \
  @capacitor/share \
  @capacitor/local-notifications \
  @capacitor/screen-orientation \
  @capacitor/browser \
  @capacitor/haptics \
  capacitor-keep-awake

echo ""
echo "✅ All Capacitor plugins installed."
echo ""
echo "Now run:"
echo "  npx cap sync"
echo ""
echo "Then for iOS, open Xcode and add these to Info.plist:"
echo "  NSLocationWhenInUseUsageDescription"
echo "  NSLocationAlwaysAndWhenInUseUsageDescription"
echo ""
echo "For Android, these permissions go in AndroidManifest.xml:"
echo "  ACCESS_FINE_LOCATION"
echo "  ACCESS_COARSE_LOCATION"
echo "  FOREGROUND_SERVICE"