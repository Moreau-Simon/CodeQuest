import { isUuidV7, uuidv7 } from './uuid';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidv7', () => {
  it('produit un UUID version 7 au format RFC 9562', () => {
    const id = uuidv7();
    expect(id).toMatch(UUID_V7);
    expect(isUuidV7(id)).toBe(true);
  });

  it('encode le timestamp courant dans les 48 premiers bits', () => {
    const before = Date.now();
    const id = uuidv7();
    const after = Date.now();
    const timestamp = parseInt(id.replace(/-/g, '').slice(0, 12), 16);
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it('reste strictement croissant pour des appels rapprochés', () => {
    const ids = Array.from({ length: 5000 }, () => uuidv7());
    expect(new Set(ids).size).toBe(ids.length);
    const sorted = [...ids].sort();
    expect(sorted).toEqual(ids);
  });

  it('reste croissant même en forçant le même milliseconde', () => {
    const fixed = 1_800_000_000_000;
    const ids = Array.from({ length: 1000 }, () => uuidv7(fixed));
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });

  it('rejette les valeurs qui ne sont pas des UUIDv7', () => {
    expect(isUuidV7('018f2c9e-7b3a-4c4d-9e11-2a6f5d4c8b01')).toBe(false);
    expect(isUuidV7('pas-un-uuid')).toBe(false);
    expect(isUuidV7(null)).toBe(false);
  });
});
