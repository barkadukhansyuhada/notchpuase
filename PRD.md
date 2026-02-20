# PuasaNotch PRD

## Product Overview
PuasaNotch is a macOS menubar app that provides Ramadan/daily prayer reminders and a notch-style top-center overlay inspired by Dynamic Island behavior.

## Personas
- Daily fasting user on MacBook who needs glanceable countdowns and accurate prayer reminders throughout the day.
- User who keeps full-screen apps active and wants reminders to remain visible across spaces.

## MVP Goals
1. Menubar tray icon with menu:
- Toggle Overlay
- Refresh Schedule
- Open Settings
- Quit

2. Notch overlay states:
- Hidden
- Collapsed pill with next event label + live countdown
- Expanded panel with:
  - city/location
  - Gregorian date
  - optional Hijri date
  - daily event list: Sahur/Imsak, Subuh, Syuruq, Dhuha, Zuhur, Asar, Maghrib/Iftar, Isya
  - per-event countdown for each row
  - fasting status (`Currently fasting`) between configured fasting start and Maghrib

3. Overlay interaction:
- Click collapsed pill toggles expanded
- Click outside collapses
- ESC collapses

4. Notifications:
- Configurable reminder offsets per event
- macOS native notifications with event/time context
- default wajib offsets: `-15,-10,-5,0` for Subuh/Zuhur/Asar/Maghrib/Isya

5. Settings window:
- Location: city, lat/lon, timezone
- Calculation method enum: MWL, ISNA, Egypt, UmmAlQura, Karachi
- Imsak offset minutes
- Reminder offsets per event
- Overlay options:
  - enabled
  - follow mouse display
  - Y offset fine tune
  - 12/24-hour format
- Persistence via electron-store

## Nice-to-Have (Implemented in this version)
- Follow mouse display mode.
- Optional auto-hide overlay outside Ramadan.
- Basic notification log in settings.

## Non-Goals
- iOS/iPad support.
- Server-side sync or cloud profile storage.
- External prayer-time APIs for core functionality.

## User Stories
- As a fasting user, I can see the next relevant event and countdown at a glance.
- As a user, I can see every key prayer event and its countdown in one expanded view.
- As a user with multiple displays, I can pin the overlay under the active display/menu bar area.
- As a user with specific fiqh preferences, I can choose the calculation method and imsak offset.
- As a user, I can tune vertical overlay placement when notch alignment is not exact.

## Functional Requirements
- Offline-first prayer schedule calculation from location + timezone + method.
- Correct next-event resolution across day boundaries.
- Reminder scheduling and re-scheduling after sleep/resume.
- Day rollover re-sync.
- Single-instance app lifecycle.

## Acceptance Criteria
- `npm install && npm run dev` starts app with tray and collapsed overlay.
- Tray toggle reliably hides/shows overlay.
- Overlay expands/collapses with click + outside click + ESC behavior.
- Overlay top-centers below menu bar baseline with user Y offset tuning.
- Surabaya sample location renders valid daily times.
- Countdown updates every second in collapsed mode.
- Notifications fire using configured offsets.
- Resume from sleep triggers re-sync and correct next event.
- `npm test` passes.
