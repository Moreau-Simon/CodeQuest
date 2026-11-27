import { useState } from 'react';
import type { ChatState } from '../../hooks/useChat';
import { t } from '../../i18n';
import { ChatMessageList } from './ChatMessageList';

export interface ChatPanelProps {
  chat: ChatState;
}

function seconds(ms: number): string {
  return (ms / 1_000).toFixed(1).replace('.', ',');
}

/** T234/T236 : panneau de chat branché sur `useChat` (canaux et reconnexion). */
export function ChatPanel({ chat }: ChatPanelProps): JSX.Element {
  const [draft, setDraft] = useState('');
  const active = chat.channels.find((channel) => channel.id === chat.activeChannelId);
  const readOnly = active?.kind === 'spectator' || active?.canWrite === false;

  const submit = (): void => {
    const body = draft.trim();
    if (!body) return;
    void chat.send(body);
    setDraft('');
  };

  return (
    <section className="rounded-xl border border-elevated p-4" aria-label={t('chat.title')}>
      <h2 className="text-xl font-semibold">{t('chat.title')}</h2>

      {chat.channels.length > 1 ? (
        <div role="tablist" aria-label={t('chat.channels')} className="mt-3 flex flex-wrap gap-2">
          {chat.channels.map((channel) => (
            <button
              key={channel.id}
              type="button"
              role="tab"
              aria-selected={channel.id === chat.activeChannelId}
              className={
                channel.id === chat.activeChannelId
                  ? 'rounded-lg bg-primary px-3 py-1 text-sm font-semibold text-surface'
                  : 'rounded-lg border border-elevated px-3 py-1 text-sm'
              }
              onClick={() => chat.setActiveChannel(channel.id)}
            >
              {channel.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-3">
        <ChatMessageList
          messages={chat.messages}
          typingName={chat.typingName}
          onReport={(messageId) => void chat.report(messageId, 'spam')}
        />
      </div>

      {chat.retryAfterMs !== null && chat.retryAfterMs > 0 ? (
        <p role="status" className="mt-2 text-sm text-warning">
          {t('chat.rateLimited', { seconds: seconds(chat.retryAfterMs) })}
        </p>
      ) : null}
      {chat.sanction ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {t('chat.sanction', {
            kind: chat.sanction.kind,
            reason: chat.sanction.reason,
            date: chat.sanction.expiresAt
          })}
        </p>
      ) : null}
      {chat.error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {t(chat.error as 'chat.error')}
        </p>
      ) : null}
      {!chat.connected ? (
        <p className="mt-2 text-sm text-muted">{t('chat.offline')}</p>
      ) : null}

      {readOnly ? (
        <p className="mt-3 text-sm text-muted">{t('chat.readOnly')}</p>
      ) : (
        <div className="mt-3 flex items-end gap-2">
          <label className="flex-1 text-sm">
            {t('chat.messageLabel')}
            <textarea
              aria-label={t('chat.messageLabel')}
              className="mt-1 w-full rounded-lg border border-elevated bg-surface p-2"
              rows={2}
              maxLength={2000}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                chat.notifyTyping();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
            />
          </label>
          <button
            type="button"
            className="rounded-lg bg-primary px-4 py-2 font-semibold text-surface disabled:opacity-50"
            disabled={!draft.trim()}
            onClick={submit}
          >
            {t('chat.send')}
          </button>
        </div>
      )}
    </section>
  );
}
