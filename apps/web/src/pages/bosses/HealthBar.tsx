import { useId } from 'react';
import { cn } from '../../components/ui';

export interface HealthBarProps {
  hp: number;
  maxHp: number;
  label: string;
  /** Animation désactivable via la préférence « réduire les animations ». */
  animated?: boolean;
}

/**
 * Barre de PV accessible (T184, FR-067) : valeur annoncée aux lecteurs d'écran,
 * largeur bornée à 100 % et transition désactivable.
 */
export function HealthBar({
  hp,
  maxHp,
  label,
  animated = true
}: HealthBarProps): JSX.Element {
  const labelId = useId();
  const current = Math.max(0, Math.min(maxHp, hp));
  const percentage = maxHp > 0 ? (current / maxHp) * 100 : 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span id={labelId} className="font-medium">
          {label}
        </span>
        <span className="tabular-nums text-muted">
          {current}/{maxHp}
        </span>
      </div>
      <div
        role="progressbar"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={maxHp}
        aria-valuenow={current}
        className="h-3 w-full overflow-hidden rounded-full bg-elevated"
      >
        <div
          className={cn('h-full rounded-full bg-danger', animated && 'transition-[width] duration-500')}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
