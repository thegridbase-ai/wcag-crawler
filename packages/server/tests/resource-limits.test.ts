import { describe, expect, it } from 'vitest';
import { getEffectiveBrowserConcurrency } from '../src/utils/resource-limits.js';

describe('getEffectiveBrowserConcurrency', () => {
  it('clamps requested concurrency to the configured browser limit', () => {
    expect(getEffectiveBrowserConcurrency(3, '1')).toBe(1);
  });

  it('keeps requested concurrency when the limit is unset or invalid', () => {
    expect(getEffectiveBrowserConcurrency(3, undefined)).toBe(3);
    expect(getEffectiveBrowserConcurrency(3, 'invalid')).toBe(3);
  });
});
