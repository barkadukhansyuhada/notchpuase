export interface OverlaySize {
  width: number;
  height: number;
}

export const REMINDER_RESIZE_DURATION_MS = 180;

export const OVERLAY_Y_OFFSET_MIN = -64;
export const OVERLAY_Y_OFFSET_MAX = 96;

export const COLLAPSED_WIDTH_MIN = 280;
export const COLLAPSED_WIDTH_MAX = 560;
export const COLLAPSED_REMINDER_WIDTH_MIN = 320;
export const COLLAPSED_REMINDER_WIDTH_MAX = 760;
export const COLLAPSED_HEIGHT_MIN = 48;
export const COLLAPSED_HEIGHT_MAX = 96;
export const COLLAPSED_CONTENT_OFFSET_Y_MIN = -20;
export const COLLAPSED_CONTENT_OFFSET_Y_MAX = 32;
export const COLLAPSED_REMINDER_EXTRA_MIN = 24;

export const DEFAULT_COLLAPSED_SIZE: OverlaySize = { width: 320, height: 59 };
export const DEFAULT_COLLAPSED_REMINDER_SIZE: OverlaySize = { width: 440, height: 59 };
export const DEFAULT_COLLAPSED_CONTENT_OFFSET_Y = 0;

function clampRounded(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

export function normalizeOverlayYOffset(value: unknown): number {
  return clampRounded(value, OVERLAY_Y_OFFSET_MIN, OVERLAY_Y_OFFSET_MAX, 0);
}

export function normalizeCollapsedWidth(value: unknown): number {
  return clampRounded(value, COLLAPSED_WIDTH_MIN, COLLAPSED_WIDTH_MAX, DEFAULT_COLLAPSED_SIZE.width);
}

export function normalizeCollapsedHeight(value: unknown): number {
  return clampRounded(
    value,
    COLLAPSED_HEIGHT_MIN,
    COLLAPSED_HEIGHT_MAX,
    DEFAULT_COLLAPSED_SIZE.height,
  );
}

export function normalizeCollapsedContentOffsetY(value: unknown): number {
  return clampRounded(
    value,
    COLLAPSED_CONTENT_OFFSET_Y_MIN,
    COLLAPSED_CONTENT_OFFSET_Y_MAX,
    DEFAULT_COLLAPSED_CONTENT_OFFSET_Y,
  );
}

export function normalizeCollapsedReminderWidth(value: unknown, collapsedWidth: number): number {
  const minAllowed = Math.max(COLLAPSED_REMINDER_WIDTH_MIN, collapsedWidth + COLLAPSED_REMINDER_EXTRA_MIN);
  const normalized = clampRounded(
    value,
    minAllowed,
    COLLAPSED_REMINDER_WIDTH_MAX,
    DEFAULT_COLLAPSED_REMINDER_SIZE.width,
  );
  return Math.max(normalized, minAllowed);
}
