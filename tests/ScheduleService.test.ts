import { describe, expect, it } from 'vitest';
import type { ComputedDailyTimes, LocationSettings } from '../src/shared/types';
import { ScheduleService } from '../src/main/services/ScheduleService';

const location: LocationSettings = {
  city: 'Surabaya',
  latitude: -7.2575,
  longitude: 112.7521,
  timezone: 'Asia/Jakarta',
};

function toTimes(partial: {
  date: string;
  imsak: string;
  fajr: string;
  sunrise: string;
  dhuha: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}): ComputedDailyTimes {
  return {
    date: partial.date,
    timezone: 'UTC',
    imsak: new Date(partial.imsak),
    fajr: new Date(partial.fajr),
    sunrise: new Date(partial.sunrise),
    dhuha: new Date(partial.dhuha),
    dhuhr: new Date(partial.dhuhr),
    asr: new Date(partial.asr),
    maghrib: new Date(partial.maghrib),
    isha: new Date(partial.isha),
  };
}

describe('ScheduleService', () => {
  it('computes imsak as fajr minus offset', () => {
    const service = new ScheduleService();
    const dayTimes = service.computeDailyTimes(
      new Date('2026-03-12T00:00:00.000Z'),
      location,
      'MWL',
      10,
    );

    const minutesDiff = (dayTimes.fajr.getTime() - dayTimes.imsak.getTime()) / 60_000;
    expect(minutesDiff).toBe(10);
  });

  it('computes dhuha as sunrise plus 20 minutes', () => {
    const service = new ScheduleService();
    const dayTimes = service.computeDailyTimes(
      new Date('2026-03-12T00:00:00.000Z'),
      location,
      'MWL',
      10,
    );

    const minutesDiff = (dayTimes.dhuha.getTime() - dayTimes.sunrise.getTime()) / 60_000;
    expect(minutesDiff).toBe(20);
  });

  it('selects tomorrow imsak after today isha has passed', () => {
    const service = new ScheduleService();

    const now = new Date('2026-03-12T21:00:00.000Z');
    const today = toTimes({
      date: '2026-03-12',
      imsak: '2026-03-12T04:40:00.000Z',
      fajr: '2026-03-12T04:50:00.000Z',
      sunrise: '2026-03-12T05:59:00.000Z',
      dhuha: '2026-03-12T06:19:00.000Z',
      dhuhr: '2026-03-12T11:58:00.000Z',
      asr: '2026-03-12T15:15:00.000Z',
      maghrib: '2026-03-12T17:59:00.000Z',
      isha: '2026-03-12T19:09:00.000Z',
    });
    const tomorrow = toTimes({
      date: '2026-03-13',
      imsak: '2026-03-13T04:38:00.000Z',
      fajr: '2026-03-13T04:48:00.000Z',
      sunrise: '2026-03-13T05:58:00.000Z',
      dhuha: '2026-03-13T06:18:00.000Z',
      dhuhr: '2026-03-13T11:58:00.000Z',
      asr: '2026-03-13T15:15:00.000Z',
      maghrib: '2026-03-13T17:59:00.000Z',
      isha: '2026-03-13T19:08:00.000Z',
    });

    const next = service.getNextEvent(now, today, tomorrow);

    expect(next.event).toBe('imsak');
    expect(next.sourceDate).toBe('tomorrow');
    expect(next.at.toISOString()).toBe('2026-03-13T04:38:00.000Z');
  });

  it('returns a non-negative and correct countdown for next event', () => {
    const service = new ScheduleService();

    const now = new Date('2026-03-12T04:20:00.000Z');
    const today = toTimes({
      date: '2026-03-12',
      imsak: '2026-03-12T04:30:00.000Z',
      fajr: '2026-03-12T04:40:00.000Z',
      sunrise: '2026-03-12T05:50:00.000Z',
      dhuha: '2026-03-12T06:10:00.000Z',
      dhuhr: '2026-03-12T11:58:00.000Z',
      asr: '2026-03-12T15:10:00.000Z',
      maghrib: '2026-03-12T17:55:00.000Z',
      isha: '2026-03-12T19:05:00.000Z',
    });
    const tomorrow = toTimes({
      date: '2026-03-13',
      imsak: '2026-03-13T04:30:00.000Z',
      fajr: '2026-03-13T04:40:00.000Z',
      sunrise: '2026-03-13T05:50:00.000Z',
      dhuha: '2026-03-13T06:10:00.000Z',
      dhuhr: '2026-03-13T11:58:00.000Z',
      asr: '2026-03-13T15:10:00.000Z',
      maghrib: '2026-03-13T17:55:00.000Z',
      isha: '2026-03-13T19:05:00.000Z',
    });

    const next = service.getNextEvent(now, today, tomorrow);

    expect(next.event).toBe('imsak');
    expect(next.countdownMs).toBe(10 * 60 * 1000);
    expect(next.countdownMs).toBeGreaterThanOrEqual(0);
  });
});
