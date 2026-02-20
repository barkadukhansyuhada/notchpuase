import { describe, expect, it } from 'vitest';
import {
  EXPANDED_MAX_HEIGHT,
  EXPANDED_MIN_HEIGHT,
  normalizeExpandedMeasuredHeight,
  shouldApplyExpandedMeasuredHeight,
} from '../src/main/windows/overlaySizing';

describe('overlaySizing', () => {
  it('clamps measured height below min to min', () => {
    expect(normalizeExpandedMeasuredHeight(120)).toBe(EXPANDED_MIN_HEIGHT);
  });

  it('clamps measured height above max to max', () => {
    expect(normalizeExpandedMeasuredHeight(620)).toBe(EXPANDED_MAX_HEIGHT);
  });

  it('keeps valid measured height rounded', () => {
    expect(normalizeExpandedMeasuredHeight(301.6)).toBe(302);
  });

  it('ignores tiny measured-height deltas to avoid resize thrash', () => {
    expect(shouldApplyExpandedMeasuredHeight(200, 201)).toBe(false);
    expect(shouldApplyExpandedMeasuredHeight(200, 202)).toBe(true);
  });
});
