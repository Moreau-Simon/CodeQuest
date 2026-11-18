import { describe, expect, it } from 'vitest';
import { detectAbuse } from '../src/measure/abuse';
import { buildDockerArgs, readCpuUsageUsec } from '../src/sandbox/sandbox';

/** T070 — le bac à sable refuse réseau, secrets hôte, fork bomb et OOM (SC-008). */
describe('évasion du bac à sable (T070)', () => {
  const job = {
    submissionId: 'sub-1',
    language: 'python' as const,
    code: 'print(1)',
    limits: { wallTimeMs: 2_000, cpuTimeMs: 1_000, memoryMb: 256, pidsMax: 32, outputBytes: 4_096 }
  };

  it('coupe le réseau et monte le système de fichiers en lecture seule', () => {
    const args = buildDockerArgs(job, '/tmp/workspace', 'cq-sub-1');
    expect(args).toContain('--network=none');
    expect(args).toContain('--read-only');
    expect(args).toContain('--cap-drop=ALL');
    expect(args).toContain('--security-opt=no-new-privileges');
    expect(args.some((arg) => arg.startsWith('--security-opt=seccomp='))).toBe(true);
    expect(args).toContain('--user=10001:10001');
    expect(args).toContain('--runtime=runsc');
    expect(args.join(' ')).toContain('target=/work,readonly');
  });

  it('borne les ressources (mémoire, pids, tmpfs)', () => {
    const args = buildDockerArgs(job, '/tmp/workspace', 'cq-sub-1');
    expect(args).toContain('--pids-limit=32');
    expect(args).toContain('--memory=256m');
    expect(args.some((arg) => arg.startsWith('--tmpfs=/tmp:'))).toBe(true);
  });

  it('rejette une tentative de lecture de /etc/shadow', () => {
    const verdict = detectAbuse({
      exitCode: 0,
      stderr: 'python: can not open /etc/shadow: Permission denied'
    });
    expect(verdict.rejected).toBe(true);
    expect(verdict.reasons).toContain('forbidden_binary:/etc/shadow');
  });

  it('rejette une tentative réseau', () => {
    const verdict = detectAbuse({ exitCode: 1, stderr: '', networkAttempts: 1 });
    expect(verdict.rejected).toBe(true);
    expect(verdict.reasons).toContain('network_attempt');
  });

  it('rejette une bombe de fork (dépassement de pids) et une allocation mémoire', () => {
    expect(detectAbuse({ exitCode: 137, stderr: '', oomKilled: true }).reasons).toContain('oom');
    expect(detectAbuse({ exitCode: 1, stderr: '', seccompViolations: 1 }).reasons).toContain(
      'seccomp_violation'
    );
  });

  it('ne trouve pas de cgroup pour un conteneur inexistant', () => {
    expect(readCpuUsageUsec('conteneur-inexistant')).toBeNull();
  });
});
