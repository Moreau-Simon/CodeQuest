import { Clock } from './clock';

describe('Clock', () => {
  it('expose une horloge UTC unique', () => {
    const clock = new Clock();
    const before = Date.now();
    const now = clock.now();
    const ms = clock.nowMs();
    const after = Date.now();

    expect(now).toBeInstanceOf(Date);
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(after);
    expect(ms).toBeGreaterThanOrEqual(before);
    expect(ms).toBeLessThanOrEqual(after);
  });
});
