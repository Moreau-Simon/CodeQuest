import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChatState } from '../../hooks/useChat';
import { ChatMessageList } from './ChatMessageList';
import { ChatPanel } from './ChatPanel';
import { VoiceRoom } from './VoiceRoom';

const CHANNEL_ID = '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b02';

const messages = [
  {
    id: 'message-1',
    channelId: CHANNEL_ID,
    authorName: 'ada',
    body: 'Bonjour à tous',
    createdAt: '2031-06-03T10:00:00.000Z',
    deleted: false
  },
  {
    id: 'message-2',
    channelId: CHANNEL_ID,
    authorName: 'grace',
    body: 'Message supprimé par la modération',
    createdAt: '2031-06-03T10:01:00.000Z',
    deleted: true
  }
];

describe('ChatMessageList (T234, US15)', () => {
  it('affiche les messages, la présence et le bouton de signalement', () => {
    const onReport = vi.fn();
    render(
      <ChatMessageList
        messages={messages}
        typingName="linus"
        onReport={onReport}
      />
    );

    expect(screen.getByText('Bonjour à tous')).toBeInTheDocument();
    expect(screen.getByText('Message supprimé par la modération')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('linus');
    fireEvent.click(screen.getByRole('button', { name: /Signaler ada/ }));
    expect(onReport).toHaveBeenCalledWith('message-1');
  });
});

describe('ChatPanel (T234, US15)', () => {
  function fakeChat(overrides: Partial<ChatState> = {}): ChatState {
    return {
      channels: [
        { id: CHANNEL_ID, name: 'Global', kind: 'global', canWrite: true },
        {
          id: '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b03',
          name: 'Équipe',
          kind: 'team',
          canWrite: true
        }
      ],
      activeChannelId: CHANNEL_ID,
      messages,
      typingName: null,
      connected: true,
      retryAfterMs: null,
      sanction: null,
      error: null,
      setActiveChannel: vi.fn(),
      send: vi.fn(async () => true),
      notifyTyping: vi.fn(),
      report: vi.fn(async () => true),
      ...overrides
    } as unknown as ChatState;
  }

  it('envoie le message saisi et signale un message', () => {
    const chat = fakeChat();
    render(<ChatPanel chat={chat} />);

    fireEvent.change(screen.getByRole('textbox', { name: /Message/ }), {
      target: { value: 'Salut' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    expect(chat.send).toHaveBeenCalledWith('Salut');
  });

  it('affiche le délai de limitation sans envoyer tant que le champ est vide', () => {
    const chat = fakeChat({ retryAfterMs: 1500 });
    render(<ChatPanel chat={chat} />);

    expect(screen.getByRole('status')).toHaveTextContent('1,5');
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled();
  });

  it('permet de changer de canal', () => {
    const chat = fakeChat();
    render(<ChatPanel chat={chat} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Équipe' }));
    expect(chat.setActiveChannel).toHaveBeenCalledWith(
      '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b03'
    );
  });
});

describe('VoiceRoom (T235, US15)', () => {
  it('n’active le microphone que sur action explicite et n’expose aucune commande d’enregistrement', async () => {
    const onEnableMicrophone = vi.fn();
    render(
      <VoiceRoom
        roomName={`channel:${CHANNEL_ID}`}
        participants={['ada', 'grace']}
        muted={false}
        onEnableMicrophone={onEnableMicrophone}
      />
    );

    expect(screen.getByRole('button', { name: 'Activer le microphone' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enregistrer/i })).not.toBeInTheDocument();
    expect(screen.getByText('ada')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Activer le microphone' }));
    });
    expect(onEnableMicrophone).toHaveBeenCalledTimes(1);
  });

  it('signale l’état « micro coupé »', () => {
    render(<VoiceRoom roomName={`channel:${CHANNEL_ID}`} participants={[]} muted />);
    expect(screen.getByRole('status')).toHaveTextContent('Micro coupé');
  });
});
