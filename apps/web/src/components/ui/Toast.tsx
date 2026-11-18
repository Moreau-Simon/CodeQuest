import { useCallback, useState, type ReactNode } from 'react';
import { t } from '../../i18n';
import { cn } from './cn';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  tone?: ToastTone;
}

export interface ToastProps extends ToastMessage {
  onDismiss: (id: string) => void;
}

const TONES: Record<ToastTone, string> = {
  info: 'border-primary',
  success: 'border-success',
  error: 'border-danger'
};

/**
 * Notification non bloquante (T044) : les erreurs sont annoncées
 * immédiatement (`role="alert"`), les autres messages poliment
 * (`role="status"`). Le bouton de fermeture porte un nom accessible explicite.
 */
export function Toast({
  id,
  title,
  description,
  tone = 'info',
  onDismiss
}: ToastProps): JSX.Element {
  const assertive = tone === 'error';
  return (
    <div
      role={assertive ? 'alert' : 'status'}
      aria-live={assertive ? 'assertive' : 'polite'}
      className={cn(
        'flex items-start gap-3 rounded-xl border-l-4 bg-elevated p-4 text-ink shadow-lg',
        TONES[tone]
      )}
    >
      <div className="flex-1">
        <p className="font-semibold">{title}</p>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(id)}
        aria-label={t('common.dismiss', { title })}
        className="min-h-9 min-w-9 rounded-lg px-2 text-muted hover:text-ink"
      >
        ×
      </button>
    </div>
  );
}

export interface ToastViewportProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
  children?: ReactNode;
}

/** Région unique qui empile les notifications, ancrée en bas à droite. */
export function ToastViewport({ toasts, onDismiss }: ToastViewportProps): JSX.Element {
  return (
    <div
      role="region"
      aria-label={t('common.notifications')}
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
    >
      <div className="pointer-events-auto flex flex-col gap-2">
        {toasts.map((toast) => (
          <Toast key={toast.id} {...toast} onDismiss={onDismiss} />
        ))}
      </div>
    </div>
  );
}

/** File de notifications en mémoire, utilisable par n'importe quel écran. */
export function useToasts(): {
  toasts: ToastMessage[];
  push: (toast: Omit<ToastMessage, 'id'>) => string;
  dismiss: (id: string) => void;
  clear: () => void;
} {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((current) => [...current, { ...toast, id }]);
    return id;
  }, []);

  const clear = useCallback(() => setToasts([]), []);

  return { toasts, push, dismiss, clear };
}
