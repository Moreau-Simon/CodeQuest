import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HealthBar } from './HealthBar';

describe('Barre de PV accessible (T246)', () => {
  it('ne publie jamais une valeur ARIA non numérique', () => {
    render(<HealthBar label="PV" hp={Number.NaN} maxHp={Number.NaN} />);
    const bar = screen.getByRole('progressbar');
    expect(Number.isNaN(Number(bar.getAttribute('aria-valuenow')))).toBe(false);
    expect(Number.isNaN(Number(bar.getAttribute('aria-valuemax')))).toBe(false);
  });
});
