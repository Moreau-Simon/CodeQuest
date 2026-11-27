import { useState } from 'react';
import { t } from '../../i18n';

export interface VoiceRoomProps {
  roomName: string;
  participants?: string[];
  connected?: boolean;
  muted?: boolean;
  onEnableMicrophone?: () => void | Promise<void>;
  onToggleMute?: () => void;
  onLeave?: () => void;
}

/**
 * T235 (FR-095/FR-096) : la transmission ne démarre qu'après une action
 * explicite de l'utilisateur. Aucune commande d'enregistrement n'est rendue.
 */
export function VoiceRoom({
  roomName,
  participants = [],
  connected = false,
  muted = false,
  onEnableMicrophone,
  onToggleMute,
  onLeave
}: VoiceRoomProps): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const enable = async (): Promise<void> => {
    if (!onEnableMicrophone || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await onEnableMicrophone();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-elevated p-4" aria-label={t('voice.title')}>
      <h2 className="text-xl font-semibold">{t('voice.title')}</h2>
      <p className="mt-1 text-sm text-muted">{t('voice.noRecording')}</p>

      <p role="status" className="mt-2 text-sm font-semibold">
        {muted ? t('voice.muted') : connected ? t('voice.microphoneOn') : t('voice.idle')}
      </p>

      {connected ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-elevated px-3 py-1 text-sm font-semibold"
            onClick={onToggleMute}
          >
            {muted ? t('voice.unmute') : t('voice.mute')}
          </button>
          <button
            type="button"
            className="rounded-lg border border-elevated px-3 py-1 text-sm font-semibold"
            onClick={onLeave}
          >
            {t('voice.leave')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="mt-3 rounded-lg bg-primary px-4 py-2 font-semibold text-surface disabled:opacity-50"
          disabled={busy}
          onClick={() => void enable()}
        >
          {t('voice.enableMicrophone')}
        </button>
      )}

      {failed ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {t('voice.requestFailed')}
        </p>
      ) : null}

      <h3 className="mt-4 text-lg font-semibold">{t('voice.participants')}</h3>
      {participants.length === 0 ? (
        <p className="text-sm text-muted">{t('voice.empty')}</p>
      ) : (
        <ul className="mt-1 flex flex-wrap gap-2 text-sm">
          {participants.map((name) => (
            <li key={name} className="rounded-full border border-elevated px-2 py-1">
              {name}
            </li>
          ))}
        </ul>
      )}
      <span className="sr-only">{roomName}</span>
    </section>
  );
}
