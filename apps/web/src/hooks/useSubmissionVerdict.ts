import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { io, type Socket } from 'socket.io-client';
import { getSubmission, type Submission } from '../services/challenges';

const POLL_INTERVAL_MS = 2_000;

interface VerdictEnvelope {
  id?: string;
  type?: string;
  at?: string;
  data?: Partial<Submission> & { submissionId?: string };
  submissionId?: string;
}

function isTerminal(status: Submission['status']): boolean {
  return status !== 'pending' && status !== 'running';
}

/**
 * Verdict d'une soumission (T089, FR-034) : événement Socket.IO prioritaire,
 * repli par interrogation toutes les 2 s si le transport temps réel échoue.
 */
export function useSubmissionVerdict(submissionId: string | null): {
  submission: Submission | null;
  error: string | null;
} {
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!submissionId) return;

    let active = true;
    let socket: Socket | undefined;

    const apply = (payload: VerdictEnvelope): void => {
      const data = payload.data ?? payload;
      const id = data.submissionId ?? submissionId;
      if (!active || id !== submissionId) return;
      setSubmission((current) => ({
        ...(current ?? ({} as Submission)),
        ...data,
        id: submissionId
      }));
    };

    try {
      // Même origine : le proxy Vite relaie `/socket.io` vers l'API.
      socket = io('/realtime', { withCredentials: true, transports: ['websocket', 'polling'] });
      socket.on('submission.verdict', apply);
      socket.on('submission.started', apply);
    } catch {
      // Le repli par interrogation prend le relais.
    }

    const poll = async (): Promise<void> => {
      try {
        const latest = await getSubmission(submissionId);
        if (!active) return;
        setSubmission(latest);
        if (isTerminal(latest.status)) clearInterval(timer);
      } catch {
        if (active) setError(t('submission.verdictUnavailable'));
      }
    };

    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    void poll();

    return () => {
      active = false;
      clearInterval(timer);
      socket?.disconnect();
    };
  }, [submissionId]);

  return { submission, error };
}
