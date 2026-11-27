import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { readSoundSettings, type SoundSettings } from '../../hooks/useAmbientAudio';
import { t } from '../../i18n';
import { ApiError } from '../../services/api-client';
import { exportPersonalData, updateProfile, type Profile } from '../../services/auth';
import { Button, Field, Input } from '../../components/ui';
import { useSessionStore } from '../../stores/session';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import { NotificationSettings } from './NotificationSettings';

type VolumeChannel = Exclude<keyof SoundSettings, 'muted'>;

/**
 * Profil (T063) : pseudo, avatar, langue d'exécution et préférences
 * (FR-009, FR-010, FR-015). La suppression de compte est déléguée à une
 * modale qui exige le mot de passe.
 */
export function ProfilePage(): JSX.Element {
  const user = useSessionStore((state) => state.user);
  const setUser = useSessionStore((state) => state.setUser);
  const clearSession = useSessionStore((state) => state.clearSession);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [pseudonym, setPseudonym] = useState(user?.pseudonym ?? '');
  const [avatarKey, setAvatarKey] = useState('');
  const [language, setLanguage] = useState<'python' | 'javascript'>(
    user?.preferredLanguage ?? 'python'
  );
  const [sound, setSound] = useState<SoundSettings>(readSoundSettings(user?.preferences ?? {}));
  const [reducedMotion, setReducedMotion] = useState(user?.preferences.reducedMotion === true);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    setPseudonym(user.pseudonym);
    setAvatarKey('');
    setLanguage(user.preferredLanguage);
    setSound(readSoundSettings(user.preferences));
    setReducedMotion(user.preferences.reducedMotion === true);
  }, [user]);

  function setVolume(key: VolumeChannel, percent: number): void {
    setSound((current) => ({ ...current, [key]: Math.min(100, Math.max(0, percent)) / 100 }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setStatus('saving');
    try {
      const updated: Profile = await updateProfile({
        pseudonym,
        avatarKey: avatarKey || null,
        preferredLanguage: language,
        preferences: { ...(user?.preferences ?? {}), sound, reducedMotion }
      });
      setUser(updated);
      await queryClient.invalidateQueries({ queryKey: ['session', 'me'] });
      setStatus('saved');
    } catch (cause) {
      setStatus('idle');
      setError(cause instanceof ApiError ? cause.message : t('common.error'));
    }
  }

  async function onExport(): Promise<void> {
    setError(null);
    try {
      const data = await exportPersonalData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'codequest-donnees.json';
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('common.error'));
    }
  }

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold">{t('settings.profileTitle')}</h1>
        <p className="mt-1 text-muted">{t('settings.profileSubtitle')}</p>
      </div>

      {user && !user.emailVerified ? (
        <p role="status" className="rounded-xl bg-elevated p-3 text-sm">
          {t('auth.emailUnverified')}
        </p>
      ) : null}

      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <Field
          id="profile-pseudonym"
          label={t('settings.pseudonym')}
          hint={t('auth.pseudonymHint')}
          required
        >
          {(aria) => (
            <Input
              {...aria}
              minLength={3}
              maxLength={20}
              pattern="[a-zA-Z0-9_-]+"
              value={pseudonym}
              onChange={(event) => setPseudonym(event.target.value)}
              required
            />
          )}
        </Field>

        <Field id="profile-avatar" label={t('settings.avatar')}>
          {(aria) => (
            <Input
              {...aria}
              value={avatarKey}
              onChange={(event) => setAvatarKey(event.target.value)}
            />
          )}
        </Field>

        <Field id="profile-language" label={t('settings.language')}>
          {(aria) => (
            <select
              {...aria}
              className="min-h-11 rounded-xl border border-elevated bg-surface px-3 py-2 text-ink"
              value={language}
              onChange={(event) => setLanguage(event.target.value as 'python' | 'javascript')}
            >
              <option value="python">{t('settings.languagePython')}</option>
              <option value="javascript">{t('settings.languageJavascript')}</option>
            </select>
          )}
        </Field>

        <fieldset className="rounded-xl border border-elevated p-4">
          <legend className="px-1 font-semibold">{t('settings.preferences')}</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {(
              [
                ['master', 'settings.soundMaster'],
                ['music', 'settings.soundMusic'],
                ['effects', 'settings.soundEffects'],
                ['voice', 'settings.soundVoice']
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label htmlFor={`sound-${key}`} className="flex items-center justify-between gap-2">
                  <span>{t(label)}</span>
                  <output htmlFor={`sound-${key}`} className="text-sm text-muted">
                    {Math.round(sound[key] * 100)} %
                  </output>
                </label>
                <input
                  id={`sound-${key}`}
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(sound[key] * 100)}
                  onChange={(event) => setVolume(key, Number(event.target.value))}
                  className="w-full accent-current"
                />
              </div>
            ))}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={sound.muted}
                onChange={(event) =>
                  setSound((current) => ({ ...current, muted: event.target.checked }))
                }
              />
              {t('settings.soundMuted')}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(event) => setReducedMotion(event.target.checked)}
              />
              {t('settings.reducedMotion')}
            </label>
          </div>
        </fieldset>

        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        {status === 'saved' ? (
          <p role="status" className="text-sm text-ink">
            {t('settings.saved')}
          </p>
        ) : null}

        <Button type="submit" loading={status === 'saving'} className="w-fit">
          {status === 'saving' ? t('common.saving') : t('common.save')}
        </Button>
      </form>

      <section className="flex flex-col gap-3 rounded-xl border border-elevated p-4">
        <h2 className="text-xl font-semibold">{t('settings.sessionsTitle')}</h2>
        <Link to="/settings/sessions">{t('settings.sessionsTitle')}</Link>
      </section>

      <NotificationSettings />

      <section className="flex flex-col gap-3 rounded-xl border border-elevated p-4">
        <h2 className="text-xl font-semibold">{t('settings.dataTitle')}</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onExport}>
            {t('settings.export')}
          </Button>
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            {t('settings.deleteAccount')}
          </Button>
        </div>
      </section>

      <DeleteAccountDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => {
          setDeleteOpen(false);
          clearSession();
          navigate('/');
        }}
      />
    </section>
  );
}
