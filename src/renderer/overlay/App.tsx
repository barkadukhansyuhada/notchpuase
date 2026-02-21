import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { COLLAPSED_REMINDER_SIZE, COLLAPSED_SIZE } from '../../shared/overlayLayout';
import type { OverlaySnapshot, PrayerEvent } from '../../shared/types';

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

const EXPANDED_VERTICAL_PADDING_PX = 24;
const EXPANDED_SAFE_BOTTOM_PX = 12;
const NOTCH_UNDER_CONTENT_GAP_PX = 5;
const CONTENT_ONLY_DOWN_NUDGE_PX = 6;
const COLLAPSED_TEXT_BASELINE_PX = 20;
const COLLAPSED_TEXT_MAX_SHIFT_PX = 17;
const COLLAPSED_TOP_OVERSCAN_PX = 3;
const COLLAPSED_CONTENT_COMPENSATE_PX = 0;

function buildIslandClipPath(
  width: number,
  height: number,
  topInset: number,
  bottomRadius: number,
  topOverscan: number,
): string {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const t = Math.max(6, Math.min(w / 2 - 8, topInset));
  const br = Math.max(6, Math.min(h / 2 - 4, bottomRadius));
  const topY = -Math.max(0, topOverscan);

  const pathData = [
    `M 0 ${topY}`,
    `Q ${t} ${topY} ${t} ${t}`,
    `L ${t} ${h - br}`,
    `Q ${t} ${h} ${t + br} ${h}`,
    `L ${w - t - br} ${h}`,
    `Q ${w - t} ${h} ${w - t} ${h - br}`,
    `L ${w - t} ${t}`,
    `Q ${w - t} ${topY} ${w} ${topY}`,
    'Z',
  ].join(' ');

  return `path("${pathData}")`;
}

function formatTime(iso: string, timezone: string, use24Hour: boolean): string {
  return new Intl.DateTimeFormat([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: !use24Hour,
    timeZone: timezone,
  }).format(new Date(iso));
}

function formatCountdown(ms: number): string {
  const safe = Math.max(0, ms);
  const totalSeconds = Math.floor(safe / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function formatEventCountdown(nextAt: string, sourceDate: 'today' | 'tomorrow', now: Date): string {
  const deltaMs = Math.max(0, new Date(nextAt).getTime() - now.getTime());
  if (deltaMs <= 0) {
    return 'Sekarang';
  }

  const countdown = formatCountdown(deltaMs);
  return sourceDate === 'tomorrow' ? `Besok ${countdown}` : countdown;
}

function formatReminderHeadline(event: PrayerEvent, offsetMinutes: number): string {
  const label = EVENT_LABELS[event];
  if (offsetMinutes === 0) {
    return `Azan ${label} sekarang`;
  }

  if (offsetMinutes < 0) {
    return `Azan ${label} ${Math.abs(offsetMinutes)} menit lagi`;
  }

  return `${label} ${offsetMinutes} menit setelah azan`;
}

function buildReminderTickerText(
  event: PrayerEvent,
  offsetMinutes: number,
  city: string,
  eventAt: string,
  timezone: string,
  use24Hour: boolean,
): string {
  return `${formatReminderHeadline(event, offsetMinutes)} • ${city} • Jadwal ${formatTime(eventAt, timezone, use24Hour)} • `;
}

function computeCollapsedTextShiftPx(safeTopInsetPx: number): number {
  const shift = safeTopInsetPx - COLLAPSED_TEXT_BASELINE_PX + CONTENT_ONLY_DOWN_NUDGE_PX;
  return Math.max(0, Math.min(COLLAPSED_TEXT_MAX_SHIFT_PX, shift));
}

export function OverlayApp() {
  const [snapshot, setSnapshot] = useState<OverlaySnapshot | null>(null);
  const [now, setNow] = useState<Date>(new Date());
  const expandedContentRef = useRef<HTMLDivElement | null>(null);
  const defaultCollapsedClipPath = useMemo(
    () =>
      buildIslandClipPath(
        COLLAPSED_SIZE.width,
        COLLAPSED_SIZE.height,
        10,
        Math.floor(COLLAPSED_SIZE.height / 2) - 2,
        COLLAPSED_TOP_OVERSCAN_PX,
      ),
    [],
  );
  const baseCollapsedStyle = useMemo(
    () =>
      ({
        '--island-clip-path': defaultCollapsedClipPath,
      }) as CSSProperties,
    [defaultCollapsedClipPath],
  );

  useEffect(() => {
    let disposed = false;

    void window.puasaNotch.getOverlaySnapshot().then((initial) => {
      if (!disposed) {
        setSnapshot(initial);
      }
    });

    const unsubscribe = window.puasaNotch.onOverlaySnapshot((next) => {
      setSnapshot(next);
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        window.puasaNotch.collapseOverlay();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useLayoutEffect(() => {
    if (!snapshot || snapshot.overlayState !== 'expanded') {
      return;
    }

    const node = expandedContentRef.current;
    if (!node) {
      return;
    }

    let rafId: number | null = null;
    const publishHeight = () => {
      const contentHeight = Math.ceil(node.scrollHeight);
      const targetHeight =
        contentHeight + EXPANDED_VERTICAL_PADDING_PX + EXPANDED_SAFE_BOTTOM_PX;
      window.puasaNotch.setExpandedContentHeight(targetHeight);
    };

    const queuePublish = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        rafId = null;
        publishHeight();
      });
    };

    queuePublish();
    const observer = new ResizeObserver(() => {
      queuePublish();
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [snapshot]);

  const dynamicCountdown = useMemo(() => {
    if (!snapshot) {
      return 0;
    }

    const deltaMs = new Date(snapshot.nextEvent.at).getTime() - now.getTime();
    return Math.max(0, deltaMs);
  }, [snapshot, now]);

  if (!snapshot) {
    return (
      <div
        className="overlay-shell collapsed-shell island island-collapsed"
        style={baseCollapsedStyle}
      >
        <span className="collapsed-text">Memuat jadwal...</span>
      </div>
    );
  }

  const timezone = snapshot.location.timezone;
  const use24Hour = snapshot.settings.overlay.use24Hour;
  const reminder = snapshot.activeReminder;
  const isReminderPromptActive = reminder !== null;
  const activeCollapsedSize = isReminderPromptActive ? COLLAPSED_REMINDER_SIZE : COLLAPSED_SIZE;
  const collapsedClipPath = buildIslandClipPath(
    activeCollapsedSize.width,
    activeCollapsedSize.height,
    10,
    Math.floor(activeCollapsedSize.height / 2) - 2,
    COLLAPSED_TOP_OVERSCAN_PX,
  );
  const topSpacerPx = snapshot.display.isLikelyNotched
    ? Math.max(
        0,
        snapshot.display.safeTopInsetPx + NOTCH_UNDER_CONTENT_GAP_PX,
      )
    : 0;
  const collapsedTextShiftPx = computeCollapsedTextShiftPx(snapshot.display.safeTopInsetPx);
  const collapsedStyle = {
    '--island-clip-path': collapsedClipPath,
    '--collapsed-content-shift': `${collapsedTextShiftPx}px`,
    '--collapsed-content-compensate': snapshot.display.isLikelyNotched
      ? `${COLLAPSED_CONTENT_COMPENSATE_PX}px`
      : '0px',
  } as CSSProperties;
  const collapsedTitle = `${snapshot.location.city} • ${
    EVENT_LABELS[snapshot.nextEvent.event]
  } • ${formatCountdown(dynamicCountdown)}`;
  const reminderTickerText = reminder
    ? buildReminderTickerText(
        reminder.event,
        reminder.offsetMinutes,
        snapshot.location.city,
        reminder.eventAt,
        timezone,
        use24Hour,
      )
    : '';
  const collapsedAriaLabel = reminder
    ? `${collapsedTitle}. ${formatReminderHeadline(reminder.event, reminder.offsetMinutes)}.`
    : collapsedTitle;

  if (snapshot.overlayState === 'expanded') {
    return (
      <div
        className="overlay-shell expanded-shell expanded island island-expanded"
        role="button"
        tabIndex={0}
      >
        <div className="expanded-content" ref={expandedContentRef}>
          {topSpacerPx > 0 ? (
            <div className="notch-safe-top" style={{ height: topSpacerPx }} aria-hidden="true" />
          ) : null}
          <div className="expanded-header">
            <div>
              <div className="city">{snapshot.location.city}</div>
              <div className="date">{snapshot.gregorianDate}</div>
              {snapshot.settings.showHijriDate && snapshot.hijriDate ? (
                <div className="date secondary">{snapshot.hijriDate}</div>
              ) : null}
            </div>
            <button
              className="collapse-btn"
              type="button"
              aria-label="Tutup overlay"
              onClick={() => window.puasaNotch.collapseOverlay()}
            >
              Tutup
            </button>
          </div>

          <div className="status-row">
            <span className={`dot ${snapshot.currentlyFasting ? 'active' : 'idle'}`} />
            <span>{snapshot.currentlyFasting ? 'Sedang puasa' : 'Tidak sedang puasa'}</span>
          </div>

          {reminder ? (
            <div className="expanded-reminder-banner">
              <strong>{formatReminderHeadline(reminder.event, reminder.offsetMinutes)}</strong>
              <span>
                Jadwal: {formatTime(reminder.eventAt, timezone, use24Hour)}
              </span>
            </div>
          ) : null}

          <div className="time-list">
            {snapshot.eventRows.map((row) => {
              const isNext =
                row.event === snapshot.nextEvent.event && row.nextAt === snapshot.nextEvent.at;

              return (
                <div className={`time-item ${isNext ? 'next' : ''}`} key={row.event}>
                  <span className="time-item-label">{EVENT_LABELS[row.event]}</span>
                  <strong className="time-item-time">
                    {formatTime(row.todayAt, timezone, use24Hour)}
                  </strong>
                  <span className="time-item-countdown">
                    {formatEventCountdown(row.nextAt, row.sourceDate, now)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="next-event">
            Event berikutnya: <strong>{EVENT_LABELS[snapshot.nextEvent.event]}</strong> dalam{' '}
            <strong>{formatCountdown(dynamicCountdown)}</strong>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      className={`collapsed-stack ${isReminderPromptActive ? 'has-reminder' : ''}`}
      type="button"
      onClick={() => window.puasaNotch.toggleOverlayExpanded()}
      title="Klik untuk membuka jadwal"
      aria-label={collapsedAriaLabel}
    >
      <div
        className="overlay-shell collapsed-shell collapsed island island-collapsed collapsed-main-shell"
        style={collapsedStyle}
      >
        {isReminderPromptActive ? (
          <div className="collapsed-marquee-viewport" aria-live="polite">
            <div className="collapsed-marquee-track">
              <span className="collapsed-marquee-text">{reminderTickerText}</span>
              <span className="collapsed-marquee-text" aria-hidden="true">
                {reminderTickerText}
              </span>
            </div>
          </div>
        ) : (
          <span className="collapsed-text">{collapsedTitle}</span>
        )}
      </div>
    </button>
  );
}
