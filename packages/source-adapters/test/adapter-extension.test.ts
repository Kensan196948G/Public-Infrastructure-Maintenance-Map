import { describe, expect, it } from 'vitest';
import { listAdapters } from '../src/registry.js';
import type { SourceDescriptor } from '@pimm/ingestion-core';

/**
 * Adapter extension-base invariants (Issue #55).
 *
 * Every registered adapter must carry a fully-qualified descriptor so that
 * onboarding a new source cannot silently ship with an unknown license, an
 * undeclared CRS, or a schema fingerprint that will never match. These checks
 * are deliberately source-agnostic: they run against listAdapters(), so the
 * moment a new adapter is registered the whole fleet is re-validated.
 */

describe('adapter extension base (Issue #55)', () => {
  const adapters = listAdapters();

  it('exposes a non-empty adapter fleet', () => {
    expect(adapters.length).toBeGreaterThan(0);
  });

  it('uses unique, URL-safe kebab-case slugs', () => {
    const slugs = adapters.map((a) => a.descriptor.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    }
  });

  it('declares a known license for every adapter', () => {
    for (const a of adapters) {
      const d = a.descriptor;
      expect(d.licenseName, `${d.slug} licenseName`).toBeTruthy();
      expect(d.redistribution, `${d.slug} redistribution`).toMatch(
        /^(allowed|restricted|prohibited|unknown)$/u,
      );
    }
  });

  it('declares a CRS for every adapter (never guessed)', () => {
    for (const a of adapters) {
      expect(a.descriptor.crs, `${a.descriptor.slug} crs`).toMatch(/^EPSG:\d+$/u);
    }
  });

  it('requires attribution text for restricted sources', () => {
    for (const a of adapters) {
      const d = a.descriptor;
      if (d.redistribution === 'restricted') {
        expect(d.attributionText, `${d.slug} attributionText`).toBeTruthy();
      }
    }
  });

  it('uses https source URLs', () => {
    for (const a of adapters) {
      expect(a.descriptor.sourceUrl, `${a.descriptor.slug} sourceUrl`).toMatch(/^https:\/\//u);
    }
  });

  it('defines expectedSchemaKeys so Q008 schema drift can fire', () => {
    for (const a of adapters) {
      const d = a.descriptor;
      // Sample adapters and W05 factory may omit the field; the contract allows
      // it, but real single-file adapters should declare it.
      if (!d.slug.startsWith('sample-') && !d.slug.startsWith('river-w05-')) {
        expect(
          Array.isArray(d.expectedSchemaKeys) && d.expectedSchemaKeys.length > 0,
          `${d.slug} expectedSchemaKeys`,
        ).toBe(true);
      }
    }
  });

  it('exposes a descriptor conforming to the SourceDescriptor contract', () => {
    for (const a of adapters) {
      const d: SourceDescriptor = a.descriptor;
      expect(typeof d.slug).toBe('string');
      expect(typeof d.name).toBe('string');
      expect(typeof d.providerName).toBe('string');
      expect(typeof d.sourceUrl).toBe('string');
      expect(typeof d.accessType).toBe('string');
      expect(typeof d.format).toBe('string');
      expect(typeof d.crs).toBe('string');
    }
  });
});
