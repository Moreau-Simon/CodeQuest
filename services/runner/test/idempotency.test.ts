import { createCipheriv, randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { JobLedger } from '../src/queue/ledger';
import { processSubmission, type SandboxLike } from '../src/queue/consumer';
import type { ResultPublisher, RunnerResult, SubmissionJobData } from '../src/queue/types';

const KEY_BASE64 = 'dGVzdC1hZXMtMjU2LWtleS0zMi1ieXRlcy1sb25nISE=';

function encrypt(plaintext: string, aad: string, keyId = 'v1'): Buffer {
  const key = Buffer.from(KEY_BASE64, 'base64');
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const data = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  const encodedKeyId = Buffer.from(keyId, 'utf8');
  return Buffer.concat([Buffer.from([encodedKeyId.length]), encodedKeyId, nonce, data, tag]);
}

function makeJob(versionId: string): SubmissionJobData {
  const ciphertext = encrypt(
    JSON.stringify({ cases: [{ input: [2, 1], expected: [1, 2] }] }),
    versionId
  );
  return {
    jobId: 'sub-1',
    submissionId: 'sub-1',
    challengeId: 'challenge-1',
    challengeVersionId: versionId,
    language: 'python',
    code: 'def solve(values):\n    return sorted(values)\n',
    limits: { wallTimeMs: 2_000, cpuTimeMs: 1_000, memoryMb: 256, pidsMax: 32, outputBytes: 4_096 },
    testsRef: {
      ciphertextKey: 's3://bucket/tests.enc',
      keyId: 'v1',
      sha256: 'hash',
      ciphertextBase64: ciphertext.toString('base64')
    },
    runs: 5,
    mode: 'score',
    context: {
      subjectType: 'player',
      subjectId: 'user-1',
      eventId: null,
      isEventAttempt: false
    },
    enqueuedAt: new Date().toISOString()
  };
}

/** T071 — une même livraison ne produit qu'une seule exécution. */
describe('idempotence de job (T071)', () => {
  it('acquitte un doublon sans réexécuter le bac à sable', async () => {
    const run = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: '',
      timedOut: false,
      cpuTimeMs: 12,
      harness: { status: 'passed', passed: 1, total: 1, reason: null }
    });
    const sandbox: SandboxLike = { run };
    const published: RunnerResult[] = [];
    const publisher: ResultPublisher = {
      publish: async (result) => {
        published.push(result);
      }
    };

    const ledger = new JobLedger();
    const job = makeJob('version-1');

    await processSubmission(job, { sandbox, publisher, ledger, runnerId: 'test' });
    const callsAfterFirst = run.mock.calls.length;
    await processSubmission(job, { sandbox, publisher, ledger, runnerId: 'test' });

    expect(callsAfterFirst).toBe(5);
    expect(run).toHaveBeenCalledTimes(5);
    expect(ledger.hasCompleted('sub-1')).toBe(true);
    expect(published.filter((entry) => entry.kind === 'verdict')).toHaveLength(1);
    expect(published.filter((entry) => entry.kind === 'started')).toHaveLength(1);
  });

  it('refuse un chiffré dont l’AAD ne correspond pas à la version', async () => {
    const sandbox: SandboxLike = {
      run: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
        timedOut: false,
        cpuTimeMs: 1,
        harness: null
      })
    };
    const ledger = new JobLedger();
    const job = makeJob('version-1');

    // Le job référence une autre version que celle utilisée au chiffrement.
    await expect(
      processSubmission(
        { ...job, challengeVersionId: 'version-2' },
        { sandbox, publisher: { publish: async () => undefined }, ledger }
      )
    ).rejects.toThrow(/authentification|AAD|bad decrypt|authenticate/i);
  });
});
