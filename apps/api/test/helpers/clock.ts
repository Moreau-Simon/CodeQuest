import { Clock } from '../../src/common/clock';

/**
 * Horloge figée pour les scénarios temporels (US9, FR-061/FR-062).
 *
 * Elle remplace le provider global `Clock` via `createTestApp(infra, { clock })` :
 * aucune logique métier ne lit `Date.now()` directement, ce qui rend les
 * frontières `starts_at` / `ends_at` déterministes (y compris en heure d'été).
 */
export class FrozenClock extends Clock {
  private current: Date;

  constructor(initial: Date) {
    super();
    this.current = new Date(initial);
  }

  override now(): Date {
    return new Date(this.current);
  }

  override nowMs(): number {
    return this.current.getTime();
  }

  set(date: Date): void {
    this.current = new Date(date);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}
