import {
  computeRegeneration,
  damageHp,
  KO_DURATION_MS,
  koUntilFrom,
  lastRegenAtDuringKo,
  nextRegenerationAt,
  REGEN_INTERVAL_MS,
  restoreHp,
  type HealthSnapshot
} from '../../src/modules/bosses/health.math';

/**
 * T175 [P] [US10] — écrit avant l'implémentation (constitution IV).
 *
 * FR-067/FR-069 : 100 PV, dégâts bornés, régénération passive 1 PV / 6 min,
 * plafond et absence de régénération pendant le KO de 30 min.
 */
describe('US10 — mathématique des points de vie (T175)', () => {
  const at = (iso: string): Date => new Date(iso);

  function snapshot(overrides: Partial<HealthSnapshot> = {}): HealthSnapshot {
    return {
      hp: 60,
      maxHp: 100,
      lastRegenAt: at('2030-07-01T10:00:00.000Z'),
      koUntil: null,
      ...overrides
    };
  }

  it('borne les dégâts entre 0 et les PV maximum', () => {
    expect(damageHp(85, 15)).toBe(70);
    expect(damageHp(10, 50)).toBe(0);
    expect(damageHp(0, 10)).toBe(0);
    expect(damageHp(85, -15)).toBe(85);
  });

  it('plafonne la restauration aux PV maximum', () => {
    expect(restoreHp(85, 15)).toBe(100);
    expect(restoreHp(90, 50)).toBe(100);
    expect(restoreHp(20, 25)).toBe(45);
    expect(restoreHp(20, -5)).toBe(20);
  });

  it('régénère exactement 1 PV toutes les 6 minutes', () => {
    const result = computeRegeneration(snapshot(), at('2030-07-01T10:12:30.000Z'));

    expect(result.ticks).toBe(2);
    expect(result.hp).toBe(62);
    expect(result.koUntil).toBeNull();
    expect(result.lastRegenAt.toISOString()).toBe('2030-07-01T10:12:00.000Z');
  });

  it('ne dépasse jamais le plafond de 100 PV', () => {
    const result = computeRegeneration(
      snapshot({ hp: 99 }),
      at('2030-07-01T10:12:30.000Z')
    );

    expect(result.hp).toBe(100);
    expect(result.ticks).toBe(2);
    expect(result.lastRegenAt.toISOString()).toBe('2030-07-01T10:12:00.000Z');
  });

  it('ne régénère pas pendant le KO', () => {
    const koUntil = at('2030-07-01T10:30:00.000Z');
    const state = snapshot({ hp: 0, koUntil, lastRegenAt: lastRegenAtDuringKo(koUntil) });
    const result = computeRegeneration(state, at('2030-07-01T10:29:59.000Z'));

    expect(result.ticks).toBe(0);
    expect(result.hp).toBe(0);
    expect(result.koUntil?.toISOString()).toBe(koUntil.toISOString());
    expect(nextRegenerationAt(state, at('2030-07-01T10:29:59.000Z'))?.toISOString()).toBe(
      koUntil.toISOString()
    );
  });

  it('reprend la régénération à la fin du KO, puis toutes les 6 minutes', () => {
    const koUntil = at('2030-07-01T10:30:00.000Z');
    const state = snapshot({ hp: 0, koUntil, lastRegenAt: lastRegenAtDuringKo(koUntil) });

    const resumed = computeRegeneration(state, koUntil);
    expect(resumed.hp).toBe(1);
    expect(resumed.koUntil).toBeNull();
    expect(resumed.lastRegenAt.toISOString()).toBe(koUntil.toISOString());

    const later = computeRegeneration({ ...state, ...resumed }, at('2030-07-01T10:36:00.000Z'));
    expect(later.hp).toBe(2);
    expect(
      nextRegenerationAt({ ...state, ...resumed }, at('2030-07-01T10:31:00.000Z'))?.toISOString()
    ).toBe('2030-07-01T10:36:00.000Z');
  });

  it('fixe une échéance de KO de 30 minutes et annonce la prochaine régénération', () => {
    const now = at('2030-07-01T10:00:00.000Z');
    expect(koUntilFrom(now).toISOString()).toBe('2030-07-01T10:30:00.000Z');
    expect(KO_DURATION_MS).toBe(30 * 60_000);
    expect(REGEN_INTERVAL_MS).toBe(6 * 60_000);
    expect(nextRegenerationAt(snapshot(), now)?.toISOString()).toBe(
      '2030-07-01T10:06:00.000Z'
    );
    expect(nextRegenerationAt(snapshot({ hp: 100 }), now)).toBeNull();
  });
});
