# PuasaNotch Technical Design

## Architecture

### Main process modules
- `src/main/app.ts`
  - app lifecycle
  - single-instance lock
  - service wiring
  - typed IPC registration
- `src/main/windows/WindowManager.ts`
  - `createOverlayWindow()`
  - `createSettingsWindow()`
  - `repositionOverlay(displayId?)`
  - overlay state control (`hidden|collapsed|expanded`)
- `src/main/tray/TrayManager.ts`
  - tray icon
  - context menu actions
- `src/main/services/ScheduleService.ts`
  - `computeDailyTimes(date, location, method, imsakOffsetMinutes)`
  - `getNextEvent(now, todayTimes, tomorrowTimes)`
  - Ramadan check + serializers
- `src/main/services/LocationService.ts`
  - `detectCurrentLocation()` with network-provider fallback (`ipapi.co`, `ipwho.is`)
  - `reverseGeocodeLocation(lat, lon)` (`api.bigdatacloud.net`)
- `src/main/services/KemenagScheduleService.ts`
  - city id lookup + daily schedule fetch from Kemenag-compatible provider
  - returns parsed `ComputedDailyTimes` for today/tomorrow
- `src/main/services/NotificationService.ts`
  - `scheduleAll(now)`
  - `clearAll()`
  - `onResumeResync()`
  - `powerMonitor` suspend/resume hooks
- `src/main/store/SettingsStore.ts`
  - typed settings model
  - defaults
  - migration hooks
  - sanitizer + partial updates

### Preload
- `src/preload/index.ts`
  - secure bridge with `contextBridge`
  - typed invoke/send methods only

### Renderer
- `src/renderer/overlay/*`
  - collapsed/expanded overlay UI
  - per-second countdown
  - ESC collapse
- `src/renderer/settings/*`
  - validated settings form
  - reminder offset parsing
  - notification log display

## Data Model

### Settings (`AppSettings`)
- `location`: city, latitude, longitude, timezone
- `calculationMethod`: Kemenag | MWL | ISNA | Egypt | UmmAlQura | Karachi
- `imsakOffsetMinutes`: numeric
- `fastingStartEvent`: imsak | fajr
- `reminders`: offsets by event (minutes, negative = before)
- `overlay`: enabled/followMouseDisplay/yOffset/use24Hour/autoHideOutsideRamadan
- `scheduleSync`: online sync enable + provider (`kemenagMyQuran`)
- `showHijriDate`: boolean

### Schedule model
- `ComputedDailyTimes`: imsak, fajr, sunrise, dhuha, dhuhr, asr, maghrib, isha as `Date`
- `NextEvent`: selected upcoming event + countdown
- `OverlayEventRow`: per-event row payload (`event`, `todayAt`, `nextAt`, `sourceDate`) for renderer countdown rows
- IPC-safe serialized shape sent to renderer

## Overlay Positioning Strategy
- Notch geometry is not available from Electron APIs.
- Positioning uses menu-bar height heuristics and two anchor modes:
  - `x = display.bounds.x + (display.bounds.width - W) / 2`
  - `menuBarHeight = display.workArea.y - display.bounds.y`
  - if `menuBarHeight >= 32` (likely notch MacBook), anchor to top edge:
    - `y = display.bounds.y + userYOffset`
  - otherwise anchor below menu bar:
    - `y = display.workArea.y + userYOffset`
- This mimics Textream's top-edge pinned behavior on notch devices without requiring manual setup.
- `userYOffset` remains available as final per-device fine-tune.
- Overlay shell shape uses a renderer-side concave-top island path (clip-path) inspired by Textream's DynamicIslandShape.
- The path uses a small top overscan so anti-aliasing does not leave a visible seam under the notch.
- Expanded height is dynamic:
  - renderer measures `.expanded-content` with `ResizeObserver`
  - renderer reports target height via `overlay:set-expanded-content-height`
  - main process clamps and applies bounds updates while staying top-anchored

## Multi-Display Behavior
- Optional `followMouseDisplay` mode repositions overlay to cursor-nearest display.
- Without follow mode, overlay remains on the selected display until explicit change.

## Prayer Time Computation (Offline-First)
- Core library: `adhan`.
- Indonesia preset uses `Kemenag` mapping to `adhan.CalculationMethod.Singapore()` (Subuh -20°, Isya -18° baseline).
- Timezone handling: civil date is derived in configured IANA timezone, then UTC prayer outputs are transformed back to configured timezone.
- Imsak derived from Fajr via configured offset.
- Dhuha is derived as `sunrise + 20 minutes`.
- No network dependency required.
- Optional network helpers exist only for location convenience; schedule computation remains local.
- Optional online schedule sync:
  - enabled only when `scheduleSync.enabled` + `method=Kemenag` + Indonesia timezone.
  - app fetches city-specific daily times from provider and caches today/tomorrow context.
  - if provider fails, app automatically falls back to offline computed times.

## Reminder Prompt and Reliability
- Notification timers are generated for today + tomorrow events.
- Offsets are applied as minute deltas from event time.
- Default reminder policy in v0.2:
  - wajib prayers (Subuh/Zuhur/Asar/Maghrib/Isya): `-15,-10,-5,0`
  - non-wajib (Imsak/Syuruq/Dhuha): empty by default
- Trigger output is rendered in-overlay (Textream-like collapsed prompt expansion), not macOS Notification center.
- Main process stores `activeReminder` and temporarily switches collapsed size to a larger prompt footprint.
- Prompt auto-expires after a short duration and overlay returns to normal collapsed size.
- `powerMonitor` suspend clears timers; resume re-schedules all timers.
- Day rollover timer re-schedules the next day automatically.

## IPC Surface
- `settings:get` / `settings:update`
- `overlay:get-snapshot` / `overlay:snapshot-updated`
- `overlay:toggle-expanded` / `overlay:collapse` / `overlay:set-expanded-content-height`
- `schedule:refresh`
- `notifications:get-log`

All channels are typed via shared interfaces.

## Security Model
- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- privileged operations restricted to main process
- renderer receives a minimal typed preload API only
- external window opening denied for overlay/settings webContents

## Build + Packaging
- Bundling:
  - main/preload: `tsup`
  - renderer: `vite` multi-page (`overlay.html`, `settings.html`)
- Distribution: `electron-builder` DMG for `x64` + `arm64`

## Dependency Justification
- `adhan`: local prayer-time calculation with standard methods.
- `luxon`: reliable timezone arithmetic and formatting with IANA tz support.
- `electron-store`: persistent typed settings + migrations.

## Testing Strategy
- Unit tests for `ScheduleService`:
  - imsak = fajr - offset
  - dhuha = sunrise + 20 minutes
  - boundary behavior after Maghrib
  - boundary behavior after Isya to tomorrow Imsak
  - non-negative and correct countdown
- Unit tests for reminder offset normalization/migration:
  - legacy reminder shape (`imsak/fajr/maghrib`) migrates to full v0.2 event map
  - offsets are normalized, deduplicated, and clamped
- Unit tests for overlay sizing helper:
  - clamp below min and above max
  - valid value rounding
  - ignore tiny deltas (< 2px) to avoid resize thrash
- Manual E2E checklist in README for tray/overlay/notifications/sleep-resume behavior.
