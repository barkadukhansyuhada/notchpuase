# PuasaNotch

PuasaNotch is a macOS menubar Electron app with a notch-style overlay for Ramadan and daily prayer reminders.

## Features
- Menubar tray controls: Toggle Overlay, Refresh Schedule, Open Settings, Quit.
- Dynamic-Island-like overlay with:
  - collapsed countdown pill
  - expanded panel with location/date/times/status
- Expanded panel shows full daily events:
  - Sahur/Imsak
  - Subuh
  - Syuruq
  - Dhuha
  - Zuhur
  - Asar
  - Maghrib/Iftar
  - Isya
- Per-event countdown is shown for each row in expanded mode.
- Native macOS notifications with configurable per-event offsets.
- Default reminders for wajib prayers: `-15,-10,-5,0` (minutes before and at event).
- Offline prayer time calculation (no required API).
- Optional location helpers:
  - detect current location from network providers (coarse)
  - geocode city name into latitude/longitude/timezone
- Sleep/resume and day-rollover re-sync.
- Typed IPC bridge with secure Electron defaults.

## Tech Stack
- Electron + TypeScript
- React + Vite (overlay/settings renderers)
- electron-store (settings persistence)
- adhan + luxon (prayer computation + timezone)
- Vitest (unit tests)

## Project Structure
- `src/main/app.ts`
- `src/main/windows/WindowManager.ts`
- `src/main/tray/TrayManager.ts`
- `src/main/services/ScheduleService.ts`
- `src/main/services/NotificationService.ts`
- `src/main/store/SettingsStore.ts`
- `src/preload/index.ts`
- `src/renderer/overlay/*`
- `src/renderer/settings/*`

## Setup
```bash
npm install
```

## Development
```bash
npm run dev
```

This starts:
- Vite dev server for renderer pages
- tsup watch for Electron main/preload
- Electron app process

## Testing
```bash
npm test
```

## Lint
```bash
npm run lint
```

## Build
```bash
npm run build
```

## DMG Distribution
```bash
npm run dist
```

Output appears under `dist/` (electron-builder artifacts).

## macOS Signing + Notarization (Placeholder Workflow)
This repository ships unsigned DMG by default.

Typical production flow:
1. Configure Developer ID Application certificate in Keychain.
2. Set `CSC_NAME` and optional `CSC_LINK`/`CSC_KEY_PASSWORD` env vars for CI.
3. Enable hardened runtime and proper entitlements (already scaffolded in `assets/entitlements.mac.plist`).
4. Add notarization step (e.g., Apple notarytool) in build pipeline.
5. Staple notarization ticket to app/DMG.

## Notch Positioning Limitation
Electron does not expose official MacBook notch or safe-area rect APIs.

PuasaNotch uses this workaround:
- detect likely notch screens from menu bar height heuristics
- auto-anchor Y:
  - notch-like displays: `y = display.bounds.y + userYOffset` (top-edge anchored)
  - non-notch displays: `y = display.workArea.y + userYOffset` (below menu bar)
- `x = display.bounds.x + (display.bounds.width - W) / 2`
- center X on active display
- expose `Y offset fine tune` in settings
- island path has a tiny top overscan to suppress anti-alias seam
- expanded overlay auto-fits to measured content height (renderer -> main IPC)

On most notch MacBooks it should attach by default; use Y offset only for final fine tuning.

## Manual E2E Checklist
1. Launch with `npm run dev`; verify tray icon appears.
2. Confirm collapsed overlay appears top-center.
3. Tray `Toggle Overlay` hides/shows overlay.
4. Click collapsed pill expands panel.
5. Click outside panel collapses.
6. Press `ESC` while expanded collapses.
7. Edit settings city/method, save, verify lat/lon/timezone auto-update and overlay refreshes.
8. Set reminder offsets close to current time, verify notification fires.
9. Put machine to sleep, wake, verify schedule/next event remains correct.
10. Change Y offset and confirm vertical alignment changes.
11. If `follow mouse display` is enabled, move cursor between displays and verify overlay repositions.
12. In expanded mode, verify each event row shows its own countdown.
13. Verify default reminders apply to Subuh/Zuhur/Asar/Maghrib/Isya.

## Troubleshooting
- Overlay hidden unexpectedly:
  - check `Overlay Enabled`
  - if `Auto-hide outside Ramadan` is enabled, overlay hides outside Hijri month 9.
- Overlay not visually attached to notch:
  - open Settings and tune `Y offset fine tune (px, notch baseline)` (start at `0`, then adjust).
  - disable `Follow mouse display` if your external monitor has a different menu bar height.
- Times look incorrect:
  - verify city name is correct, then click `Auto-fill from City` or `Save Settings`.
  - if needed, use `Detect Current Location` for coarse auto-fill.
- Non-wajib reminders missing in settings:
  - settings intentionally focus on wajib reminders.
  - non-wajib events (Imsak/Syuruq/Dhuha) remain in schedule and overlay rows.
- Notifications not visible:
  - ensure macOS notifications are enabled for the app.

## Documents
- `PRD.md`
- `TECH_DESIGN.md`
