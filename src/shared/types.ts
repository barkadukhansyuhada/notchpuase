export const PRAYER_METHODS = ['Kemenag', 'MWL', 'ISNA', 'Egypt', 'UmmAlQura', 'Karachi'] as const;
export type PrayerMethod = (typeof PRAYER_METHODS)[number];
export type ScheduleSyncProvider = 'kemenagMyQuran';
export type ScheduleSource = 'offline-local' | 'kemenag-online';

export const PRAYER_EVENTS = [
  'imsak',
  'fajr',
  'sunrise',
  'dhuha',
  'dhuhr',
  'asr',
  'maghrib',
  'isha',
] as const;
export type PrayerEvent = (typeof PRAYER_EVENTS)[number];
export const PRAYER_EVENT_ORDER = [...PRAYER_EVENTS] as const;

export type OverlayState = 'hidden' | 'collapsed' | 'expanded';
export type FastingStartEvent = 'imsak' | 'fajr';

export interface LocationSettings {
  city: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface AutoDetectedLocation {
  location: LocationSettings;
  source: string;
  accuracy: 'coarse' | 'approximate';
}

export interface ReverseGeocodeResult {
  city: string;
  timezone?: string;
  country?: string;
  source: string;
}

export interface CountryOption {
  name: string;
  code: string;
}

export interface GeocodeCityResult {
  city: string;
  latitude: number;
  longitude: number;
  timezone: string;
  country?: string;
  source: string;
}

export type ReminderOffsets = Record<PrayerEvent, number[]>;

export interface OverlaySettings {
  enabled: boolean;
  followMouseDisplay: boolean;
  yOffset: number;
  use24Hour: boolean;
  autoHideOutsideRamadan: boolean;
}

export interface ScheduleSyncSettings {
  enabled: boolean;
  provider: ScheduleSyncProvider;
}

export interface AppSettings {
  location: LocationSettings;
  calculationMethod: PrayerMethod;
  imsakOffsetMinutes: number;
  fastingStartEvent: FastingStartEvent;
  reminders: ReminderOffsets;
  overlay: OverlaySettings;
  scheduleSync: ScheduleSyncSettings;
  showHijriDate: boolean;
}

export interface ComputedDailyTimes {
  date: string;
  timezone: string;
  imsak: Date;
  fajr: Date;
  sunrise: Date;
  dhuha: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
}

export interface SerializableDailyTimes {
  date: string;
  timezone: string;
  imsak: string;
  fajr: string;
  sunrise: string;
  dhuha: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

export interface NextEvent {
  event: PrayerEvent;
  at: Date;
  sourceDate: 'today' | 'tomorrow';
  countdownMs: number;
}

export interface SerializableNextEvent {
  event: PrayerEvent;
  at: string;
  sourceDate: 'today' | 'tomorrow';
  countdownMs: number;
}

export interface OverlayEventRow {
  event: PrayerEvent;
  todayAt: string;
  nextAt: string;
  sourceDate: 'today' | 'tomorrow';
}

export interface OverlayDisplayMetrics {
  displayId: number;
  menuBarHeightPx: number;
  safeTopInsetPx: number;
  isLikelyNotched: boolean;
}

export interface OverlaySnapshot {
  overlayState: OverlayState;
  location: LocationSettings;
  today: SerializableDailyTimes;
  tomorrow: SerializableDailyTimes;
  nextEvent: SerializableNextEvent;
  eventRows: OverlayEventRow[];
  activeReminder: OverlayReminderPrompt | null;
  scheduleSource: ScheduleSource;
  scheduleSyncStatus: {
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    lastError: string | null;
  };
  display: OverlayDisplayMetrics;
  currentlyFasting: boolean;
  gregorianDate: string;
  hijriDate?: string;
  settings: {
    overlay: OverlaySettings;
    fastingStartEvent: FastingStartEvent;
    showHijriDate: boolean;
  };
  lastRefreshedAt: string;
}

export interface NotificationLogEntry {
  id: string;
  event: PrayerEvent;
  reminderOffsetMinutes: number;
  scheduledFor: string;
  firedAt: string;
}

export interface OverlayReminderPrompt {
  id: string;
  event: PrayerEvent;
  offsetMinutes: number;
  eventAt: string;
  scheduledFor: string;
  firedAt: string;
  expiresAt: string;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
