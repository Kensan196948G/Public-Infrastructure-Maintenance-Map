import { describe, expect, it } from 'vitest';
import { recordKey } from '../src/index.js';

describe('recordKey', () => {
  it('returns sourceRecordId as-is when the provider supplies a native id', async () => {
    const key = await recordKey({ sourceRecordId: 'provider-123', name: '橋', geometry: null });
    expect(key).toBe('provider-123');
  });

  it('is deterministic for the same fallback name+geometry input', async () => {
    const asset = {
      sourceRecordId: null,
      name: '橋',
      geometry: { type: 'Point' as const, coordinates: [139, 35] as [number, number] },
    };
    expect(await recordKey(asset)).toBe(await recordKey(asset));
  });

  it('falls back to a stable hashed placeholder when name and geometry are both null', async () => {
    const key = await recordKey({ sourceRecordId: null, name: null, geometry: null });
    expect(key).toMatch(/^h:[0-9a-f]{64}$/);
  });

  it('does not collide when two geometries share a 128-char JSON prefix but differ after it', async () => {
    // Former implementation keyed on JSON.stringify(geometry).slice(0, 128),
    // so two LineStrings agreeing up to that offset collapsed onto the same
    // key. Precondition below confirms this fixture reproduces that exact
    // collision surface before asserting the new hash-based key tells them apart.
    const shared: [number, number][] = Array.from({ length: 15 }, (_, i) => [
      135.123456 + i,
      34.123456 + i,
    ]);
    const geometryA = { type: 'LineString' as const, coordinates: [...shared, [999.999999, 888.888888] as [number, number]] };
    const geometryB = { type: 'LineString' as const, coordinates: [...shared, [111.111111, 222.222222] as [number, number]] };

    expect(JSON.stringify(geometryA).slice(0, 128)).toBe(JSON.stringify(geometryB).slice(0, 128));

    const keyA = await recordKey({ sourceRecordId: null, name: '道路', geometry: geometryA });
    const keyB = await recordKey({ sourceRecordId: null, name: '道路', geometry: geometryB });
    expect(keyA).not.toBe(keyB);
  });
});
