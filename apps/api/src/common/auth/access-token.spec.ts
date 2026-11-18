import { signAccessToken, verifyAccessToken } from './access-token';

const SECRET = 'test-session-secret-at-least-32-characters';

describe('access token JWT', () => {
  it('signe et vérifie un jeton d’accès', () => {
    const token = signAccessToken({ userId: 'user-1', sessionId: 'session-1' }, SECRET, 900);
    const payload = verifyAccessToken(token, SECRET);
    expect(payload.sub).toBe('user-1');
    expect(payload.sid).toBe('session-1');
    expect(payload.typ).toBe('access');
    expect(payload.exp - payload.iat).toBe(900);
  });

  it('rejette un jeton expiré', () => {
    const token = signAccessToken({ userId: 'user-1', sessionId: 'session-1' }, SECRET, -1);
    expect(() => verifyAccessToken(token, SECRET)).toThrow(/expiré/i);
  });

  it('rejette une signature invalide', () => {
    const token = signAccessToken({ userId: 'user-1', sessionId: 'session-1' }, SECRET, 900);
    expect(() => verifyAccessToken(token, 'un-autre-secret-de-32-caracteres-minimum')).toThrow(
      /invalide/i
    );
  });

  it('rejette un jeton qui n’est pas de type access', () => {
    const token = signAccessToken(
      { userId: 'user-1', sessionId: 'session-1', type: 'refresh' },
      SECRET,
      900
    );
    expect(() => verifyAccessToken(token, SECRET)).toThrow(/type/i);
  });
});
