import { cn } from './cn';

export interface SkeletonProps {
  className?: string;
  /** Libellé annoncé aux lecteurs d'écran ; sans libellé, le bloc est décoratif. */
  label?: string;
}

/**
 * Squelette de chargement (T044) : purement décoratif, sauf si un libellé est
 * fourni — il devient alors une région `role="status"` qui annonce l'attente.
 */
export function Skeleton({ className, label }: SkeletonProps): JSX.Element {
  const block = (
    <span
      aria-hidden="true"
      data-testid="skeleton-block"
      className={cn('block animate-pulse rounded-lg bg-elevated', className ?? 'h-4 w-full')}
    />
  );

  if (!label) return block;

  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-2">
      <span className="sr-only">{label}</span>
      {block}
    </div>
  );
}

/** Ligne de texte squelette, pour composer rapidement un écran de chargement. */
export function SkeletonText({
  lines = 3,
  label
}: {
  lines?: number;
  label?: string;
}): JSX.Element {
  return (
    <div
      role={label ? 'status' : undefined}
      aria-busy={label ? 'true' : undefined}
      className="flex flex-col gap-2"
    >
      {label ? <span className="sr-only">{label}</span> : null}
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={index === lines - 1 ? 'h-4 w-2/3' : 'h-4 w-full'} />
      ))}
    </div>
  );
}
