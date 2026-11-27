import { useRef, useState } from 'react';
import { ChatPanel } from '../components/chat/ChatPanel';
import { VoiceRoom } from '../components/chat/VoiceRoom';
import { useChat } from '../hooks/useChat';
import { t } from '../i18n';

/** T234/T235/T236 : page unique réunissant chat textuel et salon vocal. */
export function ChatPage(): JSX.Element {
  const chat = useChat();
  const [voice, setVoice] = useState({ enabled: false, muted: false });
  const streamRef = useRef<MediaStream | null>(null);
  const teamChannel = chat.channels.find((channel) => channel.kind === 'team');
  const roomName = `channel:${teamChannel?.id ?? chat.activeChannelId ?? ''}`;

  const stopMicrophone = (): void => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
  };

  const enableMicrophone = async (): Promise<void> => {
    if (!navigator.mediaDevices?.getUserMedia || roomName.length <= 'channel:'.length) {
      setVoice({ enabled: false, muted: false });
      return;
    }
    try {
      // L'autorisation matérielle est demandée uniquement après ce clic (FR-095).
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const grant = await chat.joinVoice(roomName);
      if (!grant) {
        for (const track of stream.getTracks()) track.stop();
        setVoice({ enabled: false, muted: false });
        return;
      }
      streamRef.current = stream;
      setVoice({ enabled: true, muted: false });
    } catch {
      setVoice({ enabled: false, muted: false });
    }
  };

  const leaveVoice = (): void => {
    stopMicrophone();
    chat.leaveVoice(roomName);
    setVoice({ enabled: false, muted: false });
  };

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('chat.pageTitle')}</h1>
        <p className="mt-2 text-muted">{t('chat.pageSubtitle')}</p>
      </div>
      <ChatPanel chat={chat} />
      <VoiceRoom
        roomName={roomName}
        participants={voice.enabled ? [t('voice.you')] : []}
        connected={voice.enabled}
        muted={voice.muted}
        onEnableMicrophone={() => void enableMicrophone()}
        onToggleMute={() => {
          const muted = !voice.muted;
          for (const track of streamRef.current?.getAudioTracks() ?? []) track.enabled = !muted;
          setVoice((current) => ({ ...current, muted }));
        }}
        onLeave={leaveVoice}
      />
    </section>
  );
}
