import { AesGcmService } from './aes-gcm.service';

const KEY_BASE64 = 'dGVzdC1hZXMtMjU2LWtleS0zMi1ieXRlcy1sb25nISE=';

describe('AesGcmService', () => {
  const service = new AesGcmService(KEY_BASE64, 'v1');
  const aad = '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b01';

  it('chiffre puis déchiffre un contenu texte', () => {
    const payload = service.encrypt('tests cachés confidentiels', aad);
    expect(payload.length).toBeGreaterThan(12);
    expect(service.decrypt(payload, aad).toString('utf8')).toBe('tests cachés confidentiels');
  });

  it('chiffre puis déchiffre un contenu binaire', () => {
    const source = Buffer.from([0, 1, 2, 3, 254, 255]);
    const payload = service.encrypt(source, aad);
    expect(service.decrypt(payload, aad).equals(source)).toBe(true);
  });

  it('ne produit jamais deux fois le même chiffré (nonce aléatoire)', () => {
    const a = service.encrypt('même entrée', aad);
    const b = service.encrypt('même entrée', aad);
    expect(a.equals(b)).toBe(false);
  });

  it('refuse le déchiffrement avec un AAD différent', () => {
    const payload = service.encrypt('secret', aad);
    expect(() => service.decrypt(payload, 'autre-version')).toThrow(/authentification/i);
  });

  it('refuse un chiffré altéré (intégrité GCM)', () => {
    const payload = service.encrypt('secret', aad);
    const last = payload.length - 1;
    payload[last] = (payload[last] ?? 0) ^ 0xff;
    expect(() => service.decrypt(payload, aad)).toThrow(/authentification/i);
  });

  it('expose le key_id utilisé pour permettre la rotation', () => {
    const payload = service.encrypt('secret', aad);
    expect(service.readKeyId(payload)).toBe('v1');
  });

  it("refuse une clé qui n'a pas 32 octets", () => {
    expect(() => new AesGcmService(Buffer.from('trop court').toString('base64'), 'v1')).toThrow(
      /32 octets/
    );
  });

  it('refuse de déchiffrer avec un key_id inconnu', () => {
    const payload = service.encrypt('secret', aad);
    payload[0] = 9; // longueur du key_id altérée → format invalide
    expect(() => service.decrypt(payload, aad)).toThrow();
  });
});
