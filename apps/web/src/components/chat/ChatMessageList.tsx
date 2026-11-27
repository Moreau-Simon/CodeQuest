import type { ChatMessageView } from '../../hooks/useChat';
import { t } from '../../i18n';

export interface ChatMessageListProps {
  messages: ChatMessageView[];
  typingName?: string | null;
  onReport?: (messageId: string) => void;
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(date);
}

/** T234 : liste des messages du canal actif, indicateur de frappe et signalement. */
export function ChatMessageList({
  messages,
  typingName,
  onReport
}: ChatMessageListProps): JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <ol className="flex max-h-80 flex-col gap-2 overflow-y-auto" aria-label={t('chat.title')}>
        {messages.length === 0 ? <li className="text-sm text-muted">{t('chat.empty')}</li> : null}
        {messages.map((message) => (
          <li key={message.id} className="rounded-lg border border-elevated px-3 py-2">
            <div className="flex items-baseline justify-between gap-2 text-xs text-muted">
              <span className="font-semibold">{message.authorName || t('chat.authorDeleted')}</span>
              <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
            </div>
            <p className={message.deleted ? 'mt-1 text-sm italic text-muted' : 'mt-1 text-sm'}>
              {message.deleted ? t('chat.deletedMessage') : message.body}
            </p>
            {message.pending ? <p className="text-xs text-muted">{t('chat.sending')}</p> : null}
            {onReport && !message.deleted ? (
              <button
                type="button"
                className="mt-1 text-xs text-danger hover:underline"
                onClick={() => onReport(message.id)}
              >
                {t('chat.report', { name: message.authorName || t('chat.authorDeleted') })}
              </button>
            ) : null}
          </li>
        ))}
      </ol>
      {typingName ? (
        <p role="status" className="text-sm text-muted">
          {t('chat.typing', { name: typingName })}
        </p>
      ) : null}
    </div>
  );
}
