import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSessionStore } from '../stores/session';

/** Niveaux 0..1. Les anciennes préférences booléennes restent acceptées. */
export interface SoundSettings {
  readonly master: number;
  readonly music: number;
  readonly effects: number;
  readonly voice: number;
  readonly muted: boolean;
}

type SoundChannel = 'master' | 'music' | 'effects' | 'voice';
type SoundEffect = 'success' | 'failure' | 'unlock';

interface Gains {
  master: GainNode;
  music: GainNode;
  effects: GainNode;
  voice: GainNode;
}

const CHANNELS: readonly SoundChannel[] = ['master', 'music', 'effects', 'voice'];

function level(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(1, Math.max(0, value > 1 ? value / 100 : value));
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return 1;
}

/** Normalise `preferences.sound` (FR-079), y compris les anciens booléens. */
export function readSoundSettings(preferences: Record<string, unknown>): SoundSettings {
  const sound = (preferences.sound ?? {}) as Record<string, unknown>;
  return {
    master: level(sound.master),
    music: level(sound.music),
    effects: level(sound.effects),
    voice: level(sound.voice),
    muted: sound.muted === true
  };
}

function frequencyFor(audioKey: string): number {
  let hash = 0;
  for (const character of audioKey) hash = (hash * 31 + character.charCodeAt(0)) % 997;
  return 110 + (hash % 220);
}

const EFFECT_FREQUENCIES: Record<SoundEffect, number> = {
  success: 660,
  failure: 180,
  unlock: 880
};

/**
 * Ambiance sonore (US12, FR-079 à FR-081).
 *
 * Aucun `AudioContext` n'est créé au montage : le contexte n'existe qu'après
 * l'appel explicite à `start()`, lui-même déclenché par un geste utilisateur.
 * Les préférences sont lues dans le profil (déjà persisté par `PATCH /me`).
 */
export function useAmbientAudio(audioKey?: string | null) {
  // Le sélecteur doit renvoyer une référence stable : `?? {}` à l'intérieur du
  // sélecteur provoquerait une boucle useSyncExternalStore (getSnapshot).
  const preferences = useSessionStore((state) => state.user?.preferences);
  const settings = useMemo(() => readSoundSettings(preferences ?? {}), [preferences]);
  const [started, setStarted] = useState(false);

  const contextRef = useRef<AudioContext | null>(null);
  const gainsRef = useRef<Gains | null>(null);
  const toneRef = useRef<OscillatorNode | null>(null);
  const toneKeyRef = useRef<string | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const applyGains = useCallback((): void => {
    const gains = gainsRef.current;
    if (!gains) return;
    const current = settingsRef.current;
    const multiplier = current.muted ? 0 : 1;
    for (const channel of CHANNELS) {
      gains[channel].gain.value = current[channel] * multiplier;
    }
  }, []);

  const ensureContext = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    const Constructor = window.AudioContext;
    if (!Constructor) return null;
    if (!contextRef.current) {
      const context = new Constructor();
      const master = context.createGain();
      master.connect(context.destination);
      const gains: Gains = {
        master,
        music: context.createGain(),
        effects: context.createGain(),
        voice: context.createGain()
      };
      for (const channel of ['music', 'effects', 'voice'] as const) {
        gains[channel].connect(master);
      }
      contextRef.current = context;
      gainsRef.current = gains;
      applyGains();
    }
    return contextRef.current;
  }, [applyGains]);

  const stopTone = useCallback((): void => {
    if (!toneRef.current) return;
    try {
      toneRef.current.stop();
    } catch {
      // Oscillateur déjà arrêté lors d'un changement de région.
    }
    toneRef.current.disconnect();
    toneRef.current = null;
    toneKeyRef.current = null;
  }, []);

  const start = useCallback((): void => {
    const context = ensureContext();
    if (!context || !gainsRef.current) return;
    void context.resume();
    if (!toneRef.current && audioKey) {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequencyFor(audioKey);
      const volume = context.createGain();
      volume.gain.value = 0.06;
      oscillator.connect(volume);
      volume.connect(gainsRef.current.music);
      oscillator.start();
      toneRef.current = oscillator;
      toneKeyRef.current = audioKey;
    }
    setStarted(true);
  }, [audioKey, ensureContext]);

  const stop = useCallback((): void => {
    stopTone();
    setStarted(false);
    const context = contextRef.current;
    if (context) void context.suspend();
  }, [stopTone]);

  const playEffect = useCallback(
    (effect: SoundEffect): void => {
      const context = contextRef.current;
      const gains = gainsRef.current;
      if (!started || !context || !gains || settingsRef.current.muted) return;
      if (settingsRef.current.effects === 0) return;
      const oscillator = context.createOscillator();
      oscillator.type = 'triangle';
      oscillator.frequency.value = EFFECT_FREQUENCIES[effect];
      const volume = context.createGain();
      volume.gain.setValueAtTime(0.12, context.currentTime);
      volume.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
      oscillator.connect(volume);
      volume.connect(gains.effects);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.2);
    },
    [started]
  );

  const speak = useCallback(
    (text: string): void => {
      if (!started || settingsRef.current.muted || settingsRef.current.voice === 0) return;
      if (typeof window === 'undefined' || !window.speechSynthesis) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'fr-FR';
      window.speechSynthesis.speak(utterance);
    },
    [started]
  );

  useEffect(() => {
    applyGains();
  }, [applyGains, settings]);

  useEffect(() => {
    if (started && audioKey && toneKeyRef.current !== audioKey) {
      stopTone();
      start();
    }
    // Le changement de région ne relance un son que si l'ambiance est active.
  }, [audioKey, start, started, stopTone]);

  useEffect(
    () => () => {
      stopTone();
      const context = contextRef.current;
      if (context) void context.close();
      contextRef.current = null;
      gainsRef.current = null;
    },
    [stopTone]
  );

  return { started, settings, start, stop, playEffect, speak };
}
