import {
  CalculationMethod,
  Coordinates,
  Madhab,
  PrayerTimes,
  type CalculationParameters,
} from 'adhan';
import { DateTime } from 'luxon';
import { PRAYER_EVENT_ORDER } from '../../shared/types';
import type {
  ComputedDailyTimes,
  FastingStartEvent,
  LocationSettings,
  NextEvent,
  OverlayEventRow,
  PrayerEvent,
  PrayerMethod,
  SerializableDailyTimes,
  SerializableNextEvent,
} from '../../shared/types';

const METHOD_FACTORIES: Record<PrayerMethod, () => CalculationParameters> = {
  MWL: () => CalculationMethod.MuslimWorldLeague(),
  ISNA: () => CalculationMethod.NorthAmerica(),
  Egypt: () => CalculationMethod.Egyptian(),
  UmmAlQura: () => CalculationMethod.UmmAlQura(),
  Karachi: () => CalculationMethod.Karachi(),
};

export class ScheduleService {
  public computeDailyTimes(
    date: Date,
    location: LocationSettings,
    method: PrayerMethod,
    imsakOffsetMinutes: number,
  ): ComputedDailyTimes {
    const zonedDate = DateTime.fromJSDate(date, { zone: location.timezone });
    if (!zonedDate.isValid) {
      throw new Error(`Invalid timezone for schedule calculation: ${location.timezone}`);
    }

    const params = METHOD_FACTORIES[method]();
    params.madhab = Madhab.Shafi;

    // Adhan expects civil date components; timezone conversion happens after UTC results are generated.
    const civilDate = new Date(zonedDate.year, zonedDate.month - 1, zonedDate.day, 12, 0, 0, 0);
    const coordinates = new Coordinates(location.latitude, location.longitude);
    const prayerTimes = new PrayerTimes(coordinates, civilDate, params);

    const toLocalZone = (value: Date) => DateTime.fromJSDate(value, { zone: 'utc' }).setZone(location.timezone);

    const fajr = toLocalZone(prayerTimes.fajr);
    const sunrise = toLocalZone(prayerTimes.sunrise);
    const dhuhr = toLocalZone(prayerTimes.dhuhr);
    const asr = toLocalZone(prayerTimes.asr);
    const maghrib = toLocalZone(prayerTimes.maghrib);
    const isha = toLocalZone(prayerTimes.isha);

    const boundedOffset = Math.max(0, Math.min(90, Math.round(imsakOffsetMinutes)));
    const imsak = fajr.minus({ minutes: boundedOffset });
    const dhuha = sunrise.plus({ minutes: 20 });

    return {
      date: zonedDate.toISODate() ?? zonedDate.toFormat('yyyy-MM-dd'),
      timezone: location.timezone,
      imsak: imsak.toJSDate(),
      fajr: fajr.toJSDate(),
      sunrise: sunrise.toJSDate(),
      dhuha: dhuha.toJSDate(),
      dhuhr: dhuhr.toJSDate(),
      asr: asr.toJSDate(),
      maghrib: maghrib.toJSDate(),
      isha: isha.toJSDate(),
    };
  }

  public getNextEvent(
    now: Date,
    todayTimes: ComputedDailyTimes,
    tomorrowTimes: ComputedDailyTimes,
  ): NextEvent {
    const candidates: Array<Omit<NextEvent, 'countdownMs'>> = [];
    for (const event of PRAYER_EVENT_ORDER) {
      candidates.push({
        event,
        at: this.getEventTime(todayTimes, event),
        sourceDate: 'today',
      });
    }
    for (const event of PRAYER_EVENT_ORDER) {
      candidates.push({
        event,
        at: this.getEventTime(tomorrowTimes, event),
        sourceDate: 'tomorrow',
      });
    }

    const next = candidates.find((candidate) => candidate.at.getTime() >= now.getTime()) ??
      candidates[candidates.length - 1];

    const countdownMs = Math.max(0, next.at.getTime() - now.getTime());
    return {
      ...next,
      countdownMs,
    };
  }

  public isCurrentlyFasting(
    now: Date,
    todayTimes: ComputedDailyTimes,
    fastingStartEvent: FastingStartEvent,
  ): boolean {
    const start = fastingStartEvent === 'imsak' ? todayTimes.imsak : todayTimes.fajr;
    return now.getTime() >= start.getTime() && now.getTime() < todayTimes.maghrib.getTime();
  }

  public buildOverlayEventRows(
    now: Date,
    todayTimes: ComputedDailyTimes,
    tomorrowTimes: ComputedDailyTimes,
  ): OverlayEventRow[] {
    return PRAYER_EVENT_ORDER.map((event) => {
      const todayAt = this.getEventTime(todayTimes, event);
      const tomorrowAt = this.getEventTime(tomorrowTimes, event);
      const sourceDate = todayAt.getTime() >= now.getTime() ? 'today' : 'tomorrow';
      const nextAt = sourceDate === 'today' ? todayAt : tomorrowAt;

      return {
        event,
        todayAt: todayAt.toISOString(),
        nextAt: nextAt.toISOString(),
        sourceDate,
      };
    });
  }

  public isRamadan(now: Date, timezone: string): boolean {
    const month = Number(
      new Intl.DateTimeFormat('en-u-ca-islamic', {
        timeZone: timezone,
        month: 'numeric',
      }).format(now),
    );

    return month === 9;
  }

  public getTomorrowReferenceDate(now: Date, timezone: string): Date {
    return DateTime.fromJSDate(now, { zone: timezone }).plus({ days: 1 }).toJSDate();
  }

  public serializeDailyTimes(times: ComputedDailyTimes): SerializableDailyTimes {
    return {
      date: times.date,
      timezone: times.timezone,
      imsak: times.imsak.toISOString(),
      fajr: times.fajr.toISOString(),
      sunrise: times.sunrise.toISOString(),
      dhuha: times.dhuha.toISOString(),
      dhuhr: times.dhuhr.toISOString(),
      asr: times.asr.toISOString(),
      maghrib: times.maghrib.toISOString(),
      isha: times.isha.toISOString(),
    };
  }

  public serializeNextEvent(nextEvent: NextEvent): SerializableNextEvent {
    return {
      event: nextEvent.event,
      at: nextEvent.at.toISOString(),
      sourceDate: nextEvent.sourceDate,
      countdownMs: nextEvent.countdownMs,
    };
  }

  public getEventTime(times: ComputedDailyTimes, event: PrayerEvent): Date {
    return times[event];
  }
}
