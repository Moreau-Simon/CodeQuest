import { RealtimeSessions, parseCookieHeader } from './realtime.sessions';

describe('parseCookieHeader', () => {
  it('analyse plusieurs cookies', () => {
    expect(parseCookieHeader('access_token=abc; refresh_token=def')).toEqual({
      access_token: 'abc',
      refresh_token: 'def'
    });
  });

  it('décode les valeurs encodées et ignore les entrées vides', () => {
    expect(parseCookieHeader('a=hello%20world; ; b=')).toEqual({ a: 'hello world', b: '' });
  });

  it('retourne un objet vide pour un en-tête absent', () => {
    expect(parseCookieHeader(undefined)).toEqual({});
    expect(parseCookieHeader('')).toEqual({});
  });
});

describe('RealtimeSessions', () => {
  function socket(userId: string, id: string) {
    return { id, data: { userId, sessionId: id }, disconnect: jest.fn() };
  }

  it('ferme uniquement les sockets de l’utilisateur révoqué', () => {
    const sessions = new RealtimeSessions();
    const a1 = socket('user-a', 's1');
    const a2 = socket('user-a', 's2');
    const b1 = socket('user-b', 's3');
    sessions.register(a1);
    sessions.register(a2);
    sessions.register(b1);

    const closed = sessions.revokeUser('user-a');

    expect(closed).toBe(2);
    expect(a1.disconnect).toHaveBeenCalledWith(true);
    expect(a2.disconnect).toHaveBeenCalledWith(true);
    expect(b1.disconnect).not.toHaveBeenCalled();
    expect(sessions.count()).toBe(1);
  });

  it('ferme une session précise sans toucher aux autres', () => {
    const sessions = new RealtimeSessions();
    const s1 = socket('user-a', 's1');
    const s2 = socket('user-a', 's2');
    sessions.register(s1);
    sessions.register(s2);

    expect(sessions.revokeSession('s1')).toBe(1);
    expect(s1.disconnect).toHaveBeenCalled();
    expect(s2.disconnect).not.toHaveBeenCalled();
  });
});
