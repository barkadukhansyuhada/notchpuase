import { powerMonitor } from 'electron';
import { DateTime } from 'luxon';
import { randomUUID } from 'node:crypto';
import { PRAYER_EVENT_ORDER } from '../../shared/types';
import type {
  AppSettings,
  ComputedDailyTimes,
  NotificationLogEntry,
  PrayerEvent,
} from '../../shared/types';
import type { ScheduleService } from './ScheduleService';

const MAX_TIMER_MS = 2_147_483_647;

interface NotificationServiceDependencies {
  scheduleService: ScheduleService;
  getSettings: () => AppSettings;
  resolveScheduleContext?: (
    now: Date,
    settings: AppSettings,
  ) => { today: ComputedDailyTimes; tomorrow: ComputedDailyTimes } | null;
  onRemindersChanged?: () => void;
  onReminderTriggered?: (payload: ReminderPromptPayload) => void;
}

export interface ReminderPromptPayload {
  id: string;
  event: PrayerEvent;
  offsetMinutes: number;
  eventAt: string;
  scheduledFor: string;
  firedAt: string;
}

export class NotificationService {
  private readonly scheduleService: ScheduleService;
  private readonly getSettings: () => AppSettings;
  private readonly resolveScheduleContext?: (
    now: Date,
    settings: AppSettings,
  ) => { today: ComputedDailyTimes; tomorrow: ComputedDailyTimes } | null;
  private readonly onRemindersChanged?: () => void;
  private readonly onReminderTriggered?: (payload: ReminderPromptPayload) => void;
  private readonly timerHandles = new Set<NodeJS.Timeout>();
  private rolloverHandle: NodeJS.Timeout | null = null;
  private readonly logs: NotificationLogEntry[] = [];

  constructor({
    scheduleService,
    getSettings,
    resolveScheduleContext,
    onRemindersChanged,
    onReminderTriggered,
  }: NotificationServiceDependencies) {
    this.scheduleService = scheduleService;
    this.getSettings = getSettings;
    this.resolveScheduleContext = resolveScheduleContext;
    this.onRemindersChanged = onRemindersChanged;
    this.onReminderTriggered = onReminderTriggered;

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
    const resolved = this.resolveScheduleContext?.(now, settings);
    const todayTimes = resolved?.today ??
      this.scheduleService.computeDailyTimes(
        now,
        settings.location,
        settings.calculationMethod,
        settings.imsakOffsetMinutes,
      );
    const tomorrowTimes = resolved?.tomorrow ??
      this.scheduleService.computeDailyTimes(
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
          this.fireReminder(item.event, item.at, scheduledTime, offsetMinutes);
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
  ): void {
    const firedAt = new Date().toISOString();
    const id = randomUUID();

    this.logs.unshift({
      id,
      event,
      reminderOffsetMinutes: offsetMinutes,
      scheduledFor: scheduledFor.toISOString(),
      firedAt,
    });

    if (this.logs.length > 50) {
      this.logs.length = 50;
    }

    this.onReminderTriggered?.({
      id,
      event,
      offsetMinutes,
      eventAt: eventAt.toISOString(),
      scheduledFor: scheduledFor.toISOString(),
      firedAt,
    });
  }
}
