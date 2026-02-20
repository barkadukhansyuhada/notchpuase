export const EXPANDED_MIN_HEIGHT = 220;
export const EXPANDED_MAX_HEIGHT = 520;
export const EXPANDED_FALLBACK_HEIGHT = 340;
export const EXPANDED_HEIGHT_DELTA_THRESHOLD_PX = 2;

export function normalizeExpandedMeasuredHeight(height: number): number {
  if (!Number.isFinite(height)) {
    return EXPANDED_FALLBACK_HEIGHT;
  }

  return Math.max(EXPANDED_MIN_HEIGHT, Math.min(EXPANDED_MAX_HEIGHT, Math.round(height)));
}

export function shouldApplyExpandedMeasuredHeight(
  previousHeight: number | null,
  nextHeight: number,
): boolean {
  if (previousHeight === null) {
    return true;
  }

  return Math.abs(previousHeight - nextHeight) >= EXPANDED_HEIGHT_DELTA_THRESHOLD_PX;
}
