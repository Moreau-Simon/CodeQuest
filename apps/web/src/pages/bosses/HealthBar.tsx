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
export function HealthBar({ hp, maxHp, label, animated = true }: HealthBarProps): JSX.Element {
  const labelId = useId();
  // T246 : une réponse API partielle ne doit jamais produire `aria-valuenow="NaN"`.
  const safeMax = Number.isFinite(maxHp) && maxHp > 0 ? maxHp : 100;
  const safeHp = Number.isFinite(hp) ? hp : 0;
  const current = Math.max(0, Math.min(safeMax, safeHp));
  const percentage = (current / safeMax) * 100;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span id={labelId} className="font-medium">
          {label}
        </span>
        <span className="tabular-nums text-muted">
          {current}/{safeMax}
        </span>
      </div>
      <div
        role="progressbar"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={current}
        className="h-3 w-full overflow-hidden rounded-full bg-elevated"
      >
        <div
          className={cn(
            'h-full rounded-full bg-danger',
            animated && 'transition-[width] duration-500'
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
