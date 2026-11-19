import { Writable } from 'node:stream';
import { createLogger } from './logger';

function captureLogs() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    }
  });
  return { stream, entries: () => lines.map((line) => JSON.parse(line)) };
}

describe('logger', () => {
  it('masque les champs sensibles (FR-113)', () => {
    const { stream, entries } = captureLogs();
    const log = createLogger(stream, 'info');

    log.info(
      {
        password: 'super-secret',
        email: 'joueur@example.com',
        user: { token: 'abc', email: 'autre@example.com' },
        req: { headers: { authorization: 'Bearer xyz', cookie: 'access_token=xyz' } }
      },
      'connexion'
    );

    const [entry] = entries();
    expect(entry.password).toBe('[REDACTED]');
    expect(entry.email).toBe('[REDACTED]');
    expect(entry.user.token).toBe('[REDACTED]');
    expect(entry.user.email).toBe('[REDACTED]');
    expect(entry.req.headers.authorization).toBe('[REDACTED]');
    expect(entry.req.headers.cookie).toBe('[REDACTED]');
    expect(entry.msg).toBe('connexion');
  });

  it('conserve les champs non sensibles', () => {
    const { stream, entries } = captureLogs();
    const log = createLogger(stream, 'info');
    log.info({ submissionId: 'sub-1', verdict: 'passed' }, 'soumission');
    const [entry] = entries();
    expect(entry.submissionId).toBe('sub-1');
    expect(entry.verdict).toBe('passed');
  });
});
