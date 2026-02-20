import { app, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { DateTime } from 'luxon';
import { IPC_CHANNELS } from '../shared/ipc';
import type { AppSettings, DeepPartial, OverlaySnapshot } from '../shared/types';
import { SettingsStore } from './store/SettingsStore';
import { ScheduleService } from './services/ScheduleService';
import { NotificationService } from './services/NotificationService';
import { LocationService } from './services/LocationService';
import { WindowManager } from './windows/WindowManager';
import { TrayManager } from './tray/TrayManager';

let settingsStore: SettingsStore;
let scheduleService: ScheduleService;
let notificationService: NotificationService;
let locationService: LocationService;
let windowManager: WindowManager;
let trayManager: TrayManager;

let settingsUnsubscribe: (() => void) | null = null;
let stateUnsubscribe: (() => void) | null = null;
let snapshotTicker: NodeJS.Timeout | null = null;
const FIRST_LAUNCH_MARKER_FILE = 'first-launch-complete';

function resolveRendererTarget(page: 'overlay.html' | 'settings.html'): string {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    return `${devServerUrl}/${page}`;
  }

  return path.join(__dirname, '..', 'renderer', page);
}

function buildOverlaySnapshot(now: Date = new Date()): OverlaySnapshot {
  const settings = settingsStore.get();
  const timezone = settings.location.timezone;

  const todayTimes = scheduleService.computeDailyTimes(
    now,
    settings.location,
    settings.calculationMethod,
    settings.imsakOffsetMinutes,
  );
  const tomorrowTimes = scheduleService.computeDailyTimes(
    scheduleService.getTomorrowReferenceDate(now, timezone),
    settings.location,
    settings.calculationMethod,
    settings.imsakOffsetMinutes,
  );

  const nextEvent = scheduleService.getNextEvent(now, todayTimes, tomorrowTimes);
  const eventRows = scheduleService.buildOverlayEventRows(now, todayTimes, tomorrowTimes);
  const display = windowManager.getOverlayDisplayMetrics();
  const todayZoned = DateTime.fromJSDate(now, { zone: timezone });

  const hijriDate = settings.showHijriDate
    ? new Intl.DateTimeFormat('en-TN-u-ca-islamic', {
        timeZone: timezone,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(now)
    : undefined;

  return {
    overlayState: windowManager.getOverlayState(),
    location: settings.location,
    today: scheduleService.serializeDailyTimes(todayTimes),
    tomorrow: scheduleService.serializeDailyTimes(tomorrowTimes),
    nextEvent: scheduleService.serializeNextEvent(nextEvent),
    eventRows,
    display,
    currentlyFasting: scheduleService.isCurrentlyFasting(
      now,
      todayTimes,
      settings.fastingStartEvent,
    ),
    gregorianDate: todayZoned.toFormat('cccc, dd LLL yyyy'),
    hijriDate,
    settings: {
      overlay: settings.overlay,
      fastingStartEvent: settings.fastingStartEvent,
      showHijriDate: settings.showHijriDate,
    },
    lastRefreshedAt: now.toISOString(),
  };
}

function publishOverlaySnapshot(): void {
  if (!windowManager.hasOverlayWindow()) {
    return;
  }

  windowManager.sendToOverlay(IPC_CHANNELS.overlaySnapshotUpdated, buildOverlaySnapshot(new Date()));
}

function applyOverlayPolicy(now: Date = new Date()): void {
  const settings = settingsStore.get();
  const currentState = windowManager.getOverlayState();

  const shouldBeVisible =
    settings.overlay.enabled &&
    (!settings.overlay.autoHideOutsideRamadan ||
      scheduleService.isRamadan(now, settings.location.timezone));

  if (shouldBeVisible && currentState === 'hidden') {
    windowManager.setOverlayState('collapsed');
  } else if (!shouldBeVisible && currentState !== 'hidden') {
    windowManager.setOverlayState('hidden');
  }

  trayManager.setOverlayEnabled(windowManager.getOverlayState() !== 'hidden');
}

function resyncScheduleAndSnapshot(now: Date = new Date()): void {
  notificationService.scheduleAll(now);
  applyOverlayPolicy(now);
  publishOverlaySnapshot();
}

function maybeShowSettingsOnFirstLaunch(): void {
  const markerPath = path.join(app.getPath('userData'), FIRST_LAUNCH_MARKER_FILE);
  if (fs.existsSync(markerPath)) {
    return;
  }

  try {
    fs.writeFileSync(markerPath, new Date().toISOString(), 'utf8');
  } catch {
    // Best-effort marker creation; opening settings is safe even if marker write fails.
  }

  windowManager.openSettingsWindow();
}

function toggleOverlayFromTray(): void {
  const currentSettings = settingsStore.get();
  const nextEnabled = !currentSettings.overlay.enabled;
  settingsStore.update({
    overlay: {
      enabled: nextEnabled,
    },
  });
}

function wireIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.settingsGet, () => settingsStore.get());

  ipcMain.handle(
    IPC_CHANNELS.settingsUpdate,
    (_event, patch: DeepPartial<AppSettings>) => {
      const updated = settingsStore.update(patch);
      return updated;
    },
  );

  ipcMain.handle(IPC_CHANNELS.overlayGetSnapshot, () => buildOverlaySnapshot(new Date()));

  ipcMain.on(IPC_CHANNELS.overlayToggleExpanded, () => {
    windowManager.toggleOverlayExpanded();
    publishOverlaySnapshot();
  });

  ipcMain.on(IPC_CHANNELS.overlayCollapse, () => {
    windowManager.collapseOverlay();
    publishOverlaySnapshot();
  });

  ipcMain.on(IPC_CHANNELS.overlaySetExpandedContentHeight, (_event, height: number) => {
    windowManager.setExpandedMeasuredHeight(height);
  });

  ipcMain.handle(IPC_CHANNELS.scheduleRefresh, () => {
    resyncScheduleAndSnapshot(new Date());
    return buildOverlaySnapshot(new Date());
  });

  ipcMain.handle(IPC_CHANNELS.notificationsGetLog, () => notificationService.getLog());

  ipcMain.handle(IPC_CHANNELS.locationDetectCurrent, async () => {
    return locationService.detectCurrentLocation();
  });

  ipcMain.handle(IPC_CHANNELS.locationListCountries, async () => {
    return locationService.listCountries();
  });

  ipcMain.handle(IPC_CHANNELS.locationListCities, async (_event, countryName: string) => {
    return locationService.listCitiesByCountry(countryName);
  });

  ipcMain.handle(
    IPC_CHANNELS.locationGeocodeCity,
    async (_event, city: string, countryCode?: string) => {
      return locationService.geocodeCity(city, countryCode);
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.locationReverseGeocode,
    async (_event, latitude: number, longitude: number) => {
      return locationService.reverseGeocodeLocation(latitude, longitude);
    },
  );
}

function boot(): void {
  settingsStore = new SettingsStore();
  scheduleService = new ScheduleService();
  locationService = new LocationService();

  const preloadPath = path.join(__dirname, '..', 'preload', 'index.js');
  windowManager = new WindowManager({
    preloadPath,
    overlayUrl: resolveRendererTarget('overlay.html'),
    settingsUrl: resolveRendererTarget('settings.html'),
    initialOverlaySettings: settingsStore.get().overlay,
  });

  trayManager = new TrayManager({
    onToggleOverlay: toggleOverlayFromTray,
    onRefreshSchedule: () => resyncScheduleAndSnapshot(new Date()),
    onOpenSettings: () => windowManager.openSettingsWindow(),
    onQuit: () => app.quit(),
  });

  notificationService = new NotificationService({
    scheduleService,
    getSettings: () => settingsStore.get(),
    onRemindersChanged: () => {
      applyOverlayPolicy(new Date());
      publishOverlaySnapshot();
    },
  });

  windowManager.createOverlayWindow();
  trayManager.create();
  wireIpcHandlers();

  settingsUnsubscribe = settingsStore.subscribe((settings) => {
    windowManager.setOverlaySettings(settings.overlay);
    resyncScheduleAndSnapshot(new Date());
  });

  stateUnsubscribe = windowManager.onOverlayStateChanged((state) => {
    trayManager.setOverlayEnabled(state !== 'hidden');
    publishOverlaySnapshot();
  });

  snapshotTicker = setInterval(() => {
    applyOverlayPolicy(new Date());
    publishOverlaySnapshot();
  }, 30_000);

  resyncScheduleAndSnapshot(new Date());
  maybeShowSettingsOnFirstLaunch();
}

function cleanup(): void {
  settingsUnsubscribe?.();
  stateUnsubscribe?.();

  if (snapshotTicker) {
    clearInterval(snapshotTicker);
    snapshotTicker = null;
  }

  notificationService?.clearAll();
  trayManager?.destroy();
  windowManager?.destroy();
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    windowManager?.openSettingsWindow();
  });

  void app
    .whenReady()
    .then(() => {
      app.dock?.hide();
      boot();
    })
    .catch((error: unknown) => {
      console.error('Failed to boot PuasaNotch', error);
      app.quit();
    });

  app.on('activate', () => {
    if (windowManager) {
      windowManager.openSettingsWindow();
    }

    if (windowManager && windowManager.getOverlayState() === 'hidden' && settingsStore.get().overlay.enabled) {
      windowManager.setOverlayState('collapsed');
      publishOverlaySnapshot();
    }
  });

  app.on('before-quit', () => {
    cleanup();
  });
}
