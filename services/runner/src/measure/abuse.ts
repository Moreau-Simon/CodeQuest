/** Détection d'abus (T085, FR-036). */
export interface AbuseSignals {
  exitCode: number;
  stderr: string;
  oomKilled?: boolean;
  networkAttempts?: number;
  seccompViolations?: number;
  outputBytes?: number;
  maxOutputBytes?: number;
}

export interface AbuseVerdict {
  rejected: boolean;
  reasons: string[];
}

const FORBIDDEN_BINARIES = [
  'curl',
  'wget',
  'nc',
  'ncat',
  'ssh',
  'scp',
  'mount',
  'ptrace',
  'nsenter',
  'unshare',
  '/etc/shadow'
];

/**
 * Un code joueur ne doit jamais accéder au réseau, lire les secrets de l'hôte,
 * forker sans limite ni produire une sortie démesurée. Toute violation produit
 * `rejected`, jamais un simple échec de test (FR-036).
 */
export function detectAbuse(signals: AbuseSignals): AbuseVerdict {
  const reasons: string[] = [];
  const stderr = signals.stderr.toLowerCase();

  if ((signals.networkAttempts ?? 0) > 0) reasons.push('network_attempt');
  if ((signals.seccompViolations ?? 0) > 0) reasons.push('seccomp_violation');
  if (signals.oomKilled) reasons.push('oom');
  for (const binary of FORBIDDEN_BINARIES) {
    if (stderr.includes(binary)) reasons.push(`forbidden_binary:${binary}`);
  }
  if (
    signals.outputBytes !== undefined &&
    signals.maxOutputBytes !== undefined &&
    signals.outputBytes > signals.maxOutputBytes
  ) {
    reasons.push('output_limit');
  }

  return { rejected: reasons.length > 0, reasons };
}
