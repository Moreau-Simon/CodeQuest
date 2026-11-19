import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Style d'erreur uniquement ; `aria-invalid` vient de `Field`. */
  invalid?: boolean;
}

/** Champ texte accessible : identifiant, états et focus fournis par `Field`. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid = false, type = 'text', ...props },
  ref
) {
  return (
    <input
      ref={ref}
      type={type}
      aria-invalid={invalid || undefined}
      className={cn(
        'min-h-11 w-full rounded-xl border border-elevated bg-surface px-3 py-2 text-ink',
        'placeholder:text-muted focus-visible:border-primary disabled:opacity-60',
        invalid && 'border-danger',
        className
      )}
      {...props}
    />
  );
});

export interface FieldProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: (aria: {
    id: string;
    'aria-describedby': string | undefined;
    'aria-invalid': boolean | undefined;
    'aria-required': boolean | undefined;
  }) => ReactNode;
}

/**
 * Enveloppe de champ accessible (T044) : le label est relié au contrôle,
 * l'aide et l'erreur sont exposées via `aria-describedby`, et l'erreur est
 * annoncée (`role="alert"`). `aria-invalid` est dérivé de la présence d'une
 * erreur, jamais laissé à l'appelant.
 */
export function Field({ id, label, hint, error, required, children }: FieldProps): JSX.Element {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        'aria-required': required ? true : undefined
      })}
      {hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
