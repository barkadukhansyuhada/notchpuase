import { Notification, powerMonitor } from 'electron';
import { DateTime } from 'luxon';
import { randomUUID } from 'node:crypto';
import { PRAYER_EVENT_ORDER } from '../../shared/types';
import type { AppSettings, NotificationLogEntry, PrayerEvent } from '../../shared/types';
import type { ScheduleService } from './ScheduleService';

const EVENT_LABELS: Record<PrayerEvent, string> = {
  imsak: 'Sahur / Imsak',
  fajr: 'Subuh',
  sunrise: 'Syuruq',
  dhuha: 'Dhuha',
  dhuhr: 'Zuhur',
  asr: 'Asar',
  maghrib: 'Maghrib / Iftar',
  isha: 'Isya',
};

const MAX_TIMER_MS = 2_147_483_647;

interface NotificationServiceDependencies {
  scheduleService: ScheduleService;
  getSettings: () => AppSettings;
  onRemindersChanged?: () => void;
}

export class NotificationService {
  private readonly scheduleService: ScheduleService;
  private readonly getSettings: () => AppSettings;
  private readonly onRemindersChanged?: () => void;
  private readonly timerHandles = new Set<NodeJS.Timeout>();
  private rolloverHandle: NodeJS.Timeout | null = null;
  private readonly logs: NotificationLogEntry[] = [];

  constructor({ scheduleService, getSettings, onRemindersChanged }: NotificationServiceDependencies) {
    this.scheduleService = scheduleService;
    this.getSettings = getSettings;
    this.onRemindersChanged = onRemindersChanged;

    powerMonitor.on('suspend', () => {
      this.clearAll();
    });

    powerMonitor.on('resume', () => {
      this.onResumeResync();
    });
  }

  public scheduleAll(now: Date = new Date()): void {
    this.clearAll();

    const settings = this.getSettings();
    const todayTimes = this.scheduleService.computeDailyTimes(
      now,
      settings.location,
      settings.calculationMethod,
      settings.imsakOffsetMinutes,
    );
    const tomorrowTimes = this.scheduleService.computeDailyTimes(
      this.scheduleService.getTomorrowReferenceDate(now, settings.location.timezone),
      settings.location,
      settings.calculationMethod,
      settings.imsakOffsetMinutes,
    );

    const dailySchedules: Array<{ event: PrayerEvent; at: Date }> = [];
    for (const event of PRAYER_EVENT_ORDER) {
      dailySchedules.push({ event, at: todayTimes[event] });
    }
    for (const event of PRAYER_EVENT_ORDER) {
      dailySchedules.push({ event, at: tomorrowTimes[event] });
    }

    for (const item of dailySchedules) {
      const offsets = settings.reminders[item.event];
      for (const offsetMinutes of offsets) {
        const scheduledTime = new Date(item.at.getTime() + offsetMinutes * 60_000);
        const delayMs = scheduledTime.getTime() - now.getTime();
        if (delayMs <= 0 || delayMs > MAX_TIMER_MS) {
          continue;
        }

        const handle = setTimeout(() => {
          this.fireReminder(item.event, item.at, scheduledTime, offsetMinutes, settings);
          this.timerHandles.delete(handle);
        }, delayMs);

        this.timerHandles.add(handle);
      }
    }

    const zonedNow = DateTime.fromJSDate(now, { zone: settings.location.timezone });
    const nextRollover = zonedNow.plus({ days: 1 }).startOf('day').plus({ seconds: 3 }).toJSDate();
    const rolloverDelay = nextRollover.getTime() - now.getTime();

    if (rolloverDelay > 0 && rolloverDelay <= MAX_TIMER_MS) {
      this.rolloverHandle = setTimeout(() => {
        this.scheduleAll(new Date());
        this.onRemindersChanged?.();
      }, rolloverDelay);
    }
  }

  public clearAll(): void {
    for (const handle of this.timerHandles) {
      clearTimeout(handle);
    }
    this.timerHandles.clear();

    if (this.rolloverHandle) {
      clearTimeout(this.rolloverHandle);
      this.rolloverHandle = null;
    }
  }

  public onResumeResync(): void {
    this.scheduleAll(new Date());
    this.onRemindersChanged?.();
  }

  public getLog(): NotificationLogEntry[] {
    return [...this.logs];
  }

  private fireReminder(
    event: PrayerEvent,
    eventAt: Date,
    scheduledFor: Date,
    offsetMinutes: number,
    settings: AppSettings,
  ): void {
    const formattedEventTime = DateTime.fromJSDate(eventAt, {
      zone: settings.location.timezone,
    }).toFormat(settings.overlay.use24Hour ? 'HH:mm' : 'hh:mm a');

    const offsetLabel =
      offsetMinutes === 0
        ? 'sekarang'
        : offsetMinutes < 0
          ? `${Math.abs(offsetMinutes)}m sebelum`
          : `${offsetMinutes}m sesudah`;

    if (Notification.isSupported()) {
      new Notification({
        title: 'PuasaNotch Reminder',
        body: `${EVENT_LABELS[event]} pukul ${formattedEventTime} (${offsetLabel})`,
      }).show();
    }

    this.logs.unshift({
      id: randomUUID(),
      event,
      reminderOffsetMinutes: offsetMinutes,
      scheduledFor: scheduledFor.toISOString(),
      firedAt: new Date().toISOString(),
    });

    if (this.logs.length > 50) {
      this.logs.length = 50;
    }
  }
}
