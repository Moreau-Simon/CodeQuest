import { bitsForStreak, consecutiveDays } from '../../src/modules/economy/rewards.service';

describe('séries de connexion (FR-072)', () => {
  const today = new Date('2030-08-03T12:00:00.000Z');

  it('compte les jours consécutifs, duplicate inclus', () => {
    expect(
      consecutiveDays(
        ['2030-08-03T08:00:00Z', '2030-08-03T09:00:00Z', '2030-08-02T09:00:00Z'],
        today
      )
    ).toBe(2);
  });

  it('s’arrête sur une interruption', () => {
    expect(consecutiveDays(['2030-08-01T09:00:00Z', '2030-07-31T09:00:00Z'], today)).toBe(0);
  });

  it('récompense au plus sept Bits par jour', () => {
    expect(bitsForStreak(0)).toBe(0);
    expect(bitsForStreak(1)).toBe(1);
    expect(bitsForStreak(30)).toBe(7);
  });
});
