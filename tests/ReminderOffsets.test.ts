import { describe, expect, it } from 'vitest';
import { DEFAULT_REMINDER_OFFSETS, normalizeReminderOffsets } from '../src/main/store/reminderOffsets';

describe('reminderOffsets', () => {
  it('migrates legacy reminder shape into full v0.2 reminder map', () => {
    const migrated = normalizeReminderOffsets({
      imsak: [-10, 0],
      fajr: [0],
      maghrib: [-5, 0],
    });

    expect(migrated.imsak).toEqual([-10, 0]);
    expect(migrated.fajr).toEqual([0]);
    expect(migrated.maghrib).toEqual([-5, 0]);
    expect(migrated.dhuhr).toEqual(DEFAULT_REMINDER_OFFSETS.dhuhr);
    expect(migrated.asr).toEqual(DEFAULT_REMINDER_OFFSETS.asr);
    expect(migrated.isha).toEqual(DEFAULT_REMINDER_OFFSETS.isha);
    expect(migrated.sunrise).toEqual([]);
    expect(migrated.dhuha).toEqual([]);
  });

  it('normalizes, deduplicates, and clamps offsets', () => {
    const normalized = normalizeReminderOffsets({
      fajr: [-15.1, -15, 'x', 999, -999, 0, 0],
    });

    expect(normalized.fajr).toEqual([-180, -15, 0, 180]);
  });
});

