import type { PrayerEvent, ReminderOffsets } from '../../shared/types';

const MIN_REMINDER_OFFSET = -180;
const MAX_REMINDER_OFFSET = 180;

export const DEFAULT_REMINDER_OFFSETS: ReminderOffsets = {
  imsak: [],
  fajr: [-15, -10, -5, 0],
  sunrise: [],
  dhuha: [],
  dhuhr: [-15, -10, -5, 0],
  asr: [-15, -10, -5, 0],
  maghrib: [-15, -10, -5, 0],
  isha: [-15, -10, -5, 0],
};

const REMINDER_EVENT_KEYS: PrayerEvent[] = [
  'imsak',
  'fajr',
  'sunrise',
  'dhuha',
  'dhuhr',
  'asr',
  'maghrib',
  'isha',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeOffsetList(value: unknown, fallback: number[]): number[] {
  const raw = Array.isArray(value) ? value : fallback;
  const deduped = new Set<number>();

  for (const offset of raw) {
    const numeric = Number(offset);
    if (!Number.isFinite(numeric)) {
      continue;
    }

    const bounded = Math.max(MIN_REMINDER_OFFSET, Math.min(MAX_REMINDER_OFFSET, Math.round(numeric)));
    deduped.add(bounded);
  }

  return [...deduped].sort((a, b) => a - b);
}

export function normalizeReminderOffsets(input: unknown): ReminderOffsets {
  const source = isRecord(input) ? input : {};
  const next = {} as ReminderOffsets;

  for (const event of REMINDER_EVENT_KEYS) {
    next[event] = normalizeOffsetList(source[event], DEFAULT_REMINDER_OFFSETS[event]);
  }

  return next;
}

