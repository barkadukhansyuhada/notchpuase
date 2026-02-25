import { app, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { DateTime } from 'luxon';
import { IPC_CHANNELS } from '../shared/ipc';
import type {
  AppSettings,
  ComputedDailyTimes,
  DeepPartial,
  OverlayPreviewPatch,
  OverlayReminderPrompt,
  OverlaySnapshot,
  ScheduleSource,
} from '../shared/types';
import {
  normalizeCollapsedContentOffsetY,
  normalizeCollapsedHeight,
  normalizeCollapsedReminderWidth,
  normalizeCollapsedWidth,
  normalizeOverlayYOffset,
} from '../shared/overlayLayout';
import { SettingsStore } from './store/SettingsStore';
import { ScheduleService } from './services/ScheduleService';
import { NotificationService } from './services/NotificationService';
import type { ReminderPromptPayload } from './services/NotificationService';
import { LocationService } from './services/LocationService';
import { KemenagScheduleService } from './services/KemenagScheduleService';
import { WindowManager } from './windows/WindowManager';
import { TrayManager } from './tray/TrayManager';

let settingsStore: SettingsStore;
let scheduleService: ScheduleService;
let notificationService: NotificationService;
let locationService: LocationService;
let kemenagScheduleService: KemenagScheduleService;
let windowManager: WindowManager;
let trayManager: TrayManager;

let settingsUnsubscribe: (() => void) | null = null;
let stateUnsubscribe: (() => void) | null = null;
let snapshotTicker: NodeJS.Timeout | null = null;
let scheduleSyncInterval: NodeJS.Timeout | null = null;
let activeReminderPrompt: OverlayReminderPrompt | null = null;
let reminderPromptTimer: NodeJS.Timeout | null = null;
const FIRST_LAUNCH_MARKER_FILE = 'first-launch-complete';
const OVERLAY_PROMPT_DURATION_MS = 16_000;
const SCHEDULE_SYNC_INTERVAL_MS = 30 * 60_000;
const INDONESIA_TIMEZONES = new Set(['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura']);

interface CachedScheduleContext {
  settingsKey: string;
  todayDate: string;
  tomorrowDate: string;
  source: ScheduleSource;
  today: ComputedDailyTimes;
  tomorrow: ComputedDailyTimes;
}

let cachedScheduleContext: CachedScheduleContext | null = null;
const scheduleSyncStatus: {
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
} = {
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastError: null,
};

function resolveRendererTarget(page: 'overlay.html' | 'settings.html'): string {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    return `${devServerUrl}/${page}`;
  }

  return path.join(__dirname, '..', 'renderer', page);
}

function normalizeOverlayPreviewPatch(
  patch: OverlayPreviewPatch,
  base: AppSettings['overlay'],
): AppSettings['overlay'] | null {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    return null;
  }

  let didUpdate = false;
  let nextCollapsedWidth = base.collapsedWidth;
  let nextCollapsedHeight = base.collapsedHeight;
  let nextCollapsedReminderWidth = base.collapsedReminderWidth;
  let nextCollapsedContentOffsetY = base.collapsedContentOffsetY;
  let nextYOffset = base.yOffset;

  if (typeof patch.collapsedWidth === 'number' && Number.isFinite(patch.collapsedWidth)) {
    nextCollapsedWidth = normalizeCollapsedWidth(patch.collapsedWidth);
    didUpdate = true;
  }

  if (
    typeof patch.collapsedReminderWidth === 'number' &&
    Number.isFinite(patch.collapsedReminderWidth)
  ) {
    nextCollapsedReminderWidth = normalizeCollapsedReminderWidth(
      patch.collapsedReminderWidth,
      nextCollapsedWidth,
    );
    didUpdate = true;
  } else if (nextCollapsedReminderWidth < nextCollapsedWidth) {
    nextCollapsedReminderWidth = normalizeCollapsedReminderWidth(
      nextCollapsedReminderWidth,
      nextCollapsedWidth,
    );
    didUpdate = true;
  }

  if (typeof patch.collapsedHeight === 'number' && Number.isFinite(patch.collapsedHeight)) {
    nextCollapsedHeight = normalizeCollapsedHeight(patch.collapsedHeight);
    didUpdate = true;
  }

  if (
    typeof patch.collapsedContentOffsetY === 'number' &&
    Number.isFinite(patch.collapsedContentOffsetY)
  ) {
    nextCollapsedContentOffsetY = normalizeCollapsedContentOffsetY(patch.collapsedContentOffsetY);
    didUpdate = true;
  }

  if (typeof patch.yOffset === 'number' && Number.isFinite(patch.yOffset)) {
    nextYOffset = normalizeOverlayYOffset(patch.yOffset);
    didUpdate = true;
  }

  if (!didUpdate) {
    return null;
  }

  return {
    ...base,
    yOffset: nextYOffset,
    collapsedWidth: nextCollapsedWidth,
    collapsedReminderWidth: nextCollapsedReminderWidth,
    collapsedHeight: nextCollapsedHeight,
    collapsedContentOffsetY: nextCollapsedContentOffsetY,
  };
}

function buildSettingsScheduleKey(settings: AppSettings): string {
  return [
    settings.location.city.trim().toLowerCase(),
    settings.location.latitude.toFixed(5),
    settings.location.longitude.toFixed(5),
    settings.location.timezone,
    settings.calculationMethod,
    settings.imsakOffsetMinutes,
    settings.scheduleSync.enabled ? '1' : '0',
    settings.scheduleSync.provider,
  ].join('|');
}

function computeOfflineScheduleContext(now: Date, settings: AppSettings): CachedScheduleContext {
  const timezone = settings.location.timezone;
  const today = scheduleService.computeDailyTimes(
    now,
    settings.location,
    settings.calculationMethod,
    settings.imsakOffsetMinutes,
  );
  const tomorrow = scheduleService.computeDailyTimes(
    scheduleService.getTomorrowReferenceDate(now, timezone),
    settings.location,
    settings.calculationMethod,
    settings.imsakOffsetMinutes,
  );

  return {
    settingsKey: buildSettingsScheduleKey(settings),
    todayDate: today.date,
    tomorrowDate: tomorrow.date,
    source: 'offline-local',
    today,
    tomorrow,
  };
}

function isScheduleSyncEligible(settings: AppSettings): boolean {
  return settings.scheduleSync.enabled &&
    settings.scheduleSync.provider === 'kemenagMyQuran' &&
    settings.calculationMethod === 'Kemenag' &&
    INDONESIA_TIMEZONES.has(settings.location.timezone);
}

function getCurrentScheduleContext(now: Date, settings: AppSettings): CachedScheduleContext {
  const offlineContext = computeOfflineScheduleContext(now, settings);
  if (!cachedScheduleContext) {
    return offlineContext;
  }

  const expectedKey = buildSettingsScheduleKey(settings);
  const isValidForNow = cachedScheduleContext.settingsKey === expectedKey &&
    cachedScheduleContext.todayDate === offlineContext.todayDate &&
    cachedScheduleContext.tomorrowDate === offlineContext.tomorrowDate;

  if (!isValidForNow) {
    return offlineContext;
  }

  return cachedScheduleContext;
}

async function syncKemenagScheduleContext(now: Date = new Date()): Promise<void> {
  const settings = settingsStore.get();
  if (!isScheduleSyncEligible(settings)) {
    cachedScheduleContext = null;
    scheduleSyncStatus.lastError = null;
    return;
  }

  scheduleSyncStatus.lastAttemptAt = now.toISOString();

  try {
    const synced = await kemenagScheduleService.fetchTodayAndTomorrow(now, settings.location);
    cachedScheduleContext = {
      settingsKey: buildSettingsScheduleKey(settings),
      todayDate: synced.today.date,
      tomorrowDate: synced.tomorrow.date,
      source: 'kemenag-online',
      today: synced.today,
      tomorrow: synced.tomorrow,
    };
    scheduleSyncStatus.lastSuccessAt = now.toISOString();
    scheduleSyncStatus.lastError = null;
  } catch (error: unknown) {
    scheduleSyncStatus.lastError =
      error instanceof Error ? error.message : 'Sinkron Kemenag gagal (unknown error).';
    cachedScheduleContext = null;
  }
}

function buildOverlaySnapshot(now: Date = new Date()): OverlaySnapshot {
  if (activeReminderPrompt && new Date(activeReminderPrompt.expiresAt).getTime() <= now.getTime()) {
    activeReminderPrompt = null;
    windowManager.setReminderPromptActive(false);
  }

  const settings = settingsStore.get();
  const timezone = settings.location.timezone;
  const scheduleContext = getCurrentScheduleContext(now, settings);
  const todayTimes = scheduleContext.today;
  const tomorrowTimes = scheduleContext.tomorrow;

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
    activeReminder: activeReminderPrompt,
    scheduleSource: scheduleContext.source,
    scheduleSyncStatus: {
      ...scheduleSyncStatus,
    },
    display,
    currentlyFasting: scheduleService.isCurrentlyFasting(
      now,
      todayTimes,
      settings.fastingStartEvent,
    ),
    gregorianDate: todayZoned.toFormat('cccc, dd LLL yyyy'),
    hijriDate,
    settings: {
      overlay: windowManager.getOverlaySettings(),
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
  const hasActivePrompt =
    activeReminderPrompt !== null &&
    new Date(activeReminderPrompt.expiresAt).getTime() > now.getTime();

  const shouldBeVisible =
    settings.overlay.enabled &&
    (hasActivePrompt ||
      !settings.overlay.autoHideOutsideRamadan ||
      scheduleService.isRamadan(now, settings.location.timezone));

  if (shouldBeVisible && currentState === 'hidden') {
    windowManager.setOverlayState('collapsed');
  } else if (!shouldBeVisible && currentState !== 'hidden') {
    windowManager.setOverlayState('hidden');
  }

  trayManager.setOverlayEnabled(windowManager.getOverlayState() !== 'hidden');
}

function clearOverlayReminderPrompt(promptId?: string): void {
  if (promptId && activeReminderPrompt?.id !== promptId) {
    return;
  }

  activeReminderPrompt = null;
  windowManager.setReminderPromptActive(false);

  if (reminderPromptTimer) {
    clearTimeout(reminderPromptTimer);
    reminderPromptTimer = null;
  }

  applyOverlayPolicy(new Date());
  publishOverlaySnapshot();
}

function showOverlayReminderPrompt(payload: ReminderPromptPayload): void {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OVERLAY_PROMPT_DURATION_MS);

  activeReminderPrompt = {
    id: payload.id,
    event: payload.event,
    offsetMinutes: payload.offsetMinutes,
    eventAt: payload.eventAt,
    scheduledFor: payload.scheduledFor,
    firedAt: payload.firedAt,
    expiresAt: expiresAt.toISOString(),
  };

  windowManager.setReminderPromptActive(true);

  const settings = settingsStore.get();
  if (settings.overlay.enabled && windowManager.getOverlayState() === 'hidden') {
    windowManager.setOverlayState('collapsed');
  }

  if (reminderPromptTimer) {
    clearTimeout(reminderPromptTimer);
  }

  reminderPromptTimer = setTimeout(() => {
    clearOverlayReminderPrompt(payload.id);
  }, OVERLAY_PROMPT_DURATION_MS);

  applyOverlayPolicy(now);
  publishOverlaySnapshot();
}

async function resyncScheduleAndSnapshot(now: Date = new Date()): Promise<void> {
  await syncKemenagScheduleContext(now);
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

  ipcMain.on(IPC_CHANNELS.overlayPreviewYOffset, (_event, yOffset: number) => {
    const current = windowManager.getOverlaySettings();
    const nextOverlay = normalizeOverlayPreviewPatch({ yOffset }, current);
    if (!nextOverlay) {
      return;
    }

    windowManager.setOverlaySettings(nextOverlay);
    publishOverlaySnapshot();
  });

  ipcMain.on(IPC_CHANNELS.overlayPreviewLayout, (_event, patch: OverlayPreviewPatch) => {
    const current = windowManager.getOverlaySettings();
    const nextOverlay = normalizeOverlayPreviewPatch(patch, current);
    if (!nextOverlay) {
      return;
    }

    windowManager.setOverlaySettings(nextOverlay);
    publishOverlaySnapshot();
  });

  ipcMain.on(IPC_CHANNELS.overlaySetExpandedContentHeight, (_event, height: number) => {
    windowManager.setExpandedMeasuredHeight(height);
  });

  ipcMain.handle(IPC_CHANNELS.scheduleRefresh, async () => {
    await resyncScheduleAndSnapshot(new Date());
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

async function boot(): Promise<void> {
  settingsStore = new SettingsStore();
  scheduleService = new ScheduleService();
  locationService = new LocationService();
  kemenagScheduleService = new KemenagScheduleService();

  const preloadPath = path.join(__dirname, '..', 'preload', 'index.js');
  windowManager = new WindowManager({
    preloadPath,
    overlayUrl: resolveRendererTarget('overlay.html'),
    settingsUrl: resolveRendererTarget('settings.html'),
    initialOverlaySettings: settingsStore.get().overlay,
  });

  trayManager = new TrayManager({
    onToggleOverlay: toggleOverlayFromTray,
    onRefreshSchedule: () => {
      void resyncScheduleAndSnapshot(new Date());
    },
    onOpenSettings: () => windowManager.openSettingsWindow(),
    onQuit: () => app.quit(),
  });

  notificationService = new NotificationService({
    scheduleService,
    getSettings: () => settingsStore.get(),
    resolveScheduleContext: (now, settings) => {
      const context = getCurrentScheduleContext(now, settings);
      return {
        today: context.today,
        tomorrow: context.tomorrow,
      };
    },
    onRemindersChanged: () => {
      void syncKemenagScheduleContext(new Date()).then(() => {
        notificationService.scheduleAll(new Date());
      });
      applyOverlayPolicy(new Date());
      publishOverlaySnapshot();
    },
    onReminderTriggered: (payload) => {
      showOverlayReminderPrompt(payload);
    },
  });

  windowManager.createOverlayWindow();
  trayManager.create();
  wireIpcHandlers();

  settingsUnsubscribe = settingsStore.subscribe((settings) => {
    windowManager.setOverlaySettings(settings.overlay);
    void resyncScheduleAndSnapshot(new Date());
  });

  stateUnsubscribe = windowManager.onOverlayStateChanged((state) => {
    trayManager.setOverlayEnabled(state !== 'hidden');
    publishOverlaySnapshot();
  });

  snapshotTicker = setInterval(() => {
    applyOverlayPolicy(new Date());
    publishOverlaySnapshot();
  }, 30_000);

  scheduleSyncInterval = setInterval(() => {
    void syncKemenagScheduleContext(new Date()).then(() => {
      notificationService.scheduleAll(new Date());
      publishOverlaySnapshot();
    });
  }, SCHEDULE_SYNC_INTERVAL_MS);

  await resyncScheduleAndSnapshot(new Date());
  maybeShowSettingsOnFirstLaunch();
}

function cleanup(): void {
  settingsUnsubscribe?.();
  stateUnsubscribe?.();

  if (snapshotTicker) {
    clearInterval(snapshotTicker);
    snapshotTicker = null;
  }

  if (scheduleSyncInterval) {
    clearInterval(scheduleSyncInterval);
    scheduleSyncInterval = null;
  }

  if (reminderPromptTimer) {
    clearTimeout(reminderPromptTimer);
    reminderPromptTimer = null;
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
    .then(async () => {
      app.dock?.hide();
      await boot();
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
