import Store from 'electron-store';
import { PRAYER_METHODS } from '../../shared/types';
import type { AppSettings, DeepPartial, PrayerMethod } from '../../shared/types';
import {
  DEFAULT_COLLAPSED_CONTENT_OFFSET_Y,
  DEFAULT_COLLAPSED_REMINDER_SIZE,
  DEFAULT_COLLAPSED_SIZE,
  normalizeCollapsedContentOffsetY,
  normalizeCollapsedHeight,
  normalizeCollapsedReminderWidth,
  normalizeCollapsedWidth,
  normalizeOverlayYOffset,
} from '../../shared/overlayLayout';
import { DEFAULT_REMINDER_OFFSETS, normalizeReminderOffsets } from './reminderOffsets';

export const DEFAULT_SETTINGS: AppSettings = {
  location: {
    city: 'Surabaya',
    latitude: -7.2575,
    longitude: 112.7521,
    timezone: 'Asia/Jakarta',
  },
  calculationMethod: 'Kemenag',
  imsakOffsetMinutes: 10,
  fastingStartEvent: 'imsak',
  reminders: normalizeReminderOffsets(DEFAULT_REMINDER_OFFSETS),
  overlay: {
    enabled: true,
    followMouseDisplay: true,
    yOffset: 0,
    collapsedWidth: DEFAULT_COLLAPSED_SIZE.width,
    collapsedReminderWidth: DEFAULT_COLLAPSED_REMINDER_SIZE.width,
    collapsedHeight: DEFAULT_COLLAPSED_SIZE.height,
    collapsedContentOffsetY: DEFAULT_COLLAPSED_CONTENT_OFFSET_Y,
    use24Hour: true,
    autoHideOutsideRamadan: false,
  },
  scheduleSync: {
    enabled: true,
    provider: 'kemenagMyQuran',
  },
  showHijriDate: true,
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeDeep<T>(target: T, patch: DeepPartial<T>): T {
  if (!isPlainObject(target) || !isPlainObject(patch)) {
    return patch as T;
  }

  const output: Record<string, unknown> = { ...target } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }

    const existingValue = output[key];
    output[key] = isPlainObject(existingValue) && isPlainObject(value)
      ? mergeDeep(existingValue, value)
      : value;
  }

  return output as T;
}

function sanitizeTimezone(timezone: string): string {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return DEFAULT_SETTINGS.location.timezone;
  }
}

function sanitizePrayerMethod(method: PrayerMethod): PrayerMethod {
  return PRAYER_METHODS.includes(method) ? method : DEFAULT_SETTINGS.calculationMethod;
}

function sanitizeSettings(input: AppSettings): AppSettings {
  return {
    ...input,
    location: {
      ...input.location,
      city: input.location.city.trim() || DEFAULT_SETTINGS.location.city,
      latitude: Math.max(-90, Math.min(90, input.location.latitude)),
      longitude: Math.max(-180, Math.min(180, input.location.longitude)),
      timezone: sanitizeTimezone(input.location.timezone),
    },
    calculationMethod: sanitizePrayerMethod(input.calculationMethod),
    imsakOffsetMinutes: Math.max(0, Math.min(90, Math.round(input.imsakOffsetMinutes))),
    reminders: normalizeReminderOffsets(input.reminders),
    overlay: {
      ...input.overlay,
      yOffset: normalizeOverlayYOffset(input.overlay.yOffset),
      collapsedWidth: normalizeCollapsedWidth(input.overlay.collapsedWidth),
      collapsedHeight: normalizeCollapsedHeight(input.overlay.collapsedHeight),
      collapsedReminderWidth: normalizeCollapsedReminderWidth(
        input.overlay.collapsedReminderWidth,
        normalizeCollapsedWidth(input.overlay.collapsedWidth),
      ),
      collapsedContentOffsetY: normalizeCollapsedContentOffsetY(input.overlay.collapsedContentOffsetY),
    },
    scheduleSync: {
      enabled: Boolean(input.scheduleSync?.enabled),
      provider: 'kemenagMyQuran',
    },
  };
}

export class SettingsStore {
  private readonly store: Store<AppSettings>;

  constructor() {
    this.store = new Store<AppSettings>({
      name: 'settings',
      defaults: DEFAULT_SETTINGS,
      migrations: {
        '0.1.0': (migrationStore) => {
          if (!migrationStore.has('fastingStartEvent')) {
            migrationStore.set('fastingStartEvent', DEFAULT_SETTINGS.fastingStartEvent);
          }
          if (!migrationStore.has('overlay.autoHideOutsideRamadan')) {
            migrationStore.set(
              'overlay.autoHideOutsideRamadan',
              DEFAULT_SETTINGS.overlay.autoHideOutsideRamadan,
            );
          }
          if (!migrationStore.has('showHijriDate')) {
            migrationStore.set('showHijriDate', DEFAULT_SETTINGS.showHijriDate);
          }
        },
        '0.1.1': (migrationStore) => {
          const yOffset = migrationStore.get('overlay.yOffset');
          if (typeof yOffset === 'number' && Math.round(yOffset) === 6) {
            migrationStore.set('overlay.yOffset', DEFAULT_SETTINGS.overlay.yOffset);
          }
        },
        '0.2.0': (migrationStore) => {
          migrationStore.set(
            'reminders',
            normalizeReminderOffsets(migrationStore.get('reminders')),
          );
        },
        '0.2.1': (migrationStore) => {
          const currentMethod = migrationStore.get('calculationMethod');
          const timezone = migrationStore.get('location.timezone');
          const indonesiaTimezones = new Set(['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura']);

          if (
            (currentMethod === undefined || currentMethod === 'MWL') &&
            typeof timezone === 'string' &&
            indonesiaTimezones.has(timezone)
          ) {
            migrationStore.set('calculationMethod', 'Kemenag');
          }
        },
        '0.2.2': (migrationStore) => {
          if (!migrationStore.has('scheduleSync')) {
            migrationStore.set('scheduleSync', DEFAULT_SETTINGS.scheduleSync);
          }
        },
        '0.2.3': (migrationStore) => {
          const currentOverlay = migrationStore.get('overlay');
          if (!isPlainObject(currentOverlay)) {
            migrationStore.set('overlay', DEFAULT_SETTINGS.overlay);
            return;
          }

          if (!migrationStore.has('overlay.collapsedWidth')) {
            migrationStore.set('overlay.collapsedWidth', DEFAULT_SETTINGS.overlay.collapsedWidth);
          }
          if (!migrationStore.has('overlay.collapsedReminderWidth')) {
            migrationStore.set(
              'overlay.collapsedReminderWidth',
              DEFAULT_SETTINGS.overlay.collapsedReminderWidth,
            );
          }
          if (!migrationStore.has('overlay.collapsedHeight')) {
            migrationStore.set('overlay.collapsedHeight', DEFAULT_SETTINGS.overlay.collapsedHeight);
          }
          if (!migrationStore.has('overlay.collapsedContentOffsetY')) {
            migrationStore.set(
              'overlay.collapsedContentOffsetY',
              DEFAULT_SETTINGS.overlay.collapsedContentOffsetY,
            );
          }
        },
      },
    });

    this.store.store = sanitizeSettings(this.store.store);
  }

  public get(): AppSettings {
    return sanitizeSettings(this.store.store);
  }

  public update(patch: DeepPartial<AppSettings>): AppSettings {
    const merged = mergeDeep(this.get(), patch);
    const sanitized = sanitizeSettings(merged);
    this.store.store = sanitized;
    return sanitized;
  }

  public replace(next: AppSettings): AppSettings {
    const sanitized = sanitizeSettings(next);
    this.store.store = sanitized;
    return sanitized;
  }

  public subscribe(listener: (settings: AppSettings) => void): () => void {
    return this.store.onDidAnyChange((newValue) => {
      listener(sanitizeSettings(newValue as AppSettings));
    });
  }
}
