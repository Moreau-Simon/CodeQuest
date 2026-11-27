import { useState, type FormEvent, type ReactNode } from 'react';
import { t } from '../../i18n';
import { ApiError } from '../../services/api-client';
import { deleteAccount } from '../../services/auth';
import { Button, Field, Input, Modal } from '../../components/ui';

interface DeleteAccountDialogProps {
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

/**
 * Confirmation par mot de passe de la suppression logique du compte (T063,
 * FR-012) : la réauthentification est vérifiée côté API, jamais côté client.
 */
export function DeleteAccountDialog({
  open,
  onClose,
  onDeleted
}: DeleteAccountDialogProps): ReactNode {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await deleteAccount(password);
      // Le compte supprimé ne doit pas être rechargé : `ProfilePage` purge la
      // session et redirige immédiatement vers l'accueil.
      setPassword('');
      onDeleted();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('settings.deleteTitle')}
      description={t('settings.deleteWarning')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" type="submit" form="delete-account-form" loading={submitting}>
            {t('settings.deleteAccount')}
          </Button>
        </div>
      }
    >
      <form id="delete-account-form" className="flex flex-col gap-3" onSubmit={onSubmit}>
        <Field
          id="delete-password"
          label={t('auth.currentPassword')}
          hint={t('settings.deleteConfirm')}
          required
        >
          {(aria) => (
            <Input
              {...aria}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          )}
        </Field>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
