import { describe, expect, it } from 'vitest';
import { validateListingEdit } from '@/domain/amazon/listing-validation';
import { byteLength } from '@/domain/amazon/rules';
import { DEFAULT_AMAZON_CONFIG } from '@/domain/amazon/config';

/**
 * Listing edit validation.
 *
 * This was covered only through the Amazon service integration tests, which is
 * thin for the one rule here that is genuinely easy to get wrong: backend
 * search terms are capped in BYTES. A character-based check accepts a value
 * Amazon silently truncates, so the user sees a save confirmation and loses
 * half the field.
 */

const MAX_BYTES = DEFAULT_AMAZON_CONFIG.backendSearchTermsMaxBytes;

function valid(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'NorthTrail Emberlite Canister Stove, 2.6 oz, Piezo Ignition',
    bullets: 'A bullet long enough to satisfy the guidance written for it here.',
    backendSearchTerms: 'synonym alternative phrasing misspelled variant',
    ...overrides,
  };
}

describe('title', () => {
  it('accepts a normal title and trims it', () => {
    const result = validateListingEdit(valid({ title: '  Spaced out title  ' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe('Spaced out title');
  });

  it('rejects an empty or whitespace-only title', () => {
    for (const title of ['', '   ', '\t\n']) {
      const result = validateListingEdit(valid({ title }));
      expect(result.ok, JSON.stringify(title)).toBe(false);
      if (result.ok) continue;
      expect(result.errors.title).toBeDefined();
    }
  });

  it('rejects a title past the configured maximum', () => {
    const result = validateListingEdit(
      valid({ title: 'a'.repeat(DEFAULT_AMAZON_CONFIG.titleMax + 1) }),
    );
    expect(result.ok).toBe(false);
  });

  it('accepts a title exactly at the maximum', () => {
    const result = validateListingEdit(
      valid({ title: 'a'.repeat(DEFAULT_AMAZON_CONFIG.titleMax) }),
    );
    expect(result.ok).toBe(true);
  });
});

describe('bullets', () => {
  it('splits a textarea into one bullet per line', () => {
    const result = validateListingEdit(
      valid({ bullets: 'First bullet\nSecond bullet\nThird bullet' }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.bullets).toEqual([
      'First bullet',
      'Second bullet',
      'Third bullet',
    ]);
  });

  it('drops blank lines rather than saving empty bullets', () => {
    const result = validateListingEdit(
      valid({ bullets: 'First\n\n   \nSecond\n' }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.bullets).toEqual(['First', 'Second']);
  });

  it('accepts no bullets at all', () => {
    // An empty field is a listing with nothing written yet, which the audit
    // will flag. Validation is not the place to refuse it.
    const result = validateListingEdit(valid({ bullets: '' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.bullets).toEqual([]);
  });

  it('accepts exactly the number Amazon displays', () => {
    const lines = Array.from(
      { length: DEFAULT_AMAZON_CONFIG.bulletsExpected },
      (_, i) => `Bullet number ${i + 1}`,
    ).join('\n');
    expect(validateListingEdit(valid({ bullets: lines })).ok).toBe(true);
  });

  it('rejects more bullets than Amazon displays', () => {
    const lines = Array.from(
      { length: DEFAULT_AMAZON_CONFIG.bulletsExpected + 1 },
      (_, i) => `Bullet number ${i + 1}`,
    ).join('\n');
    const result = validateListingEdit(valid({ bullets: lines }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.bullets).toBeDefined();
  });
});

describe('backend search terms are capped in bytes, not characters', () => {
  it('accepts a value exactly at the byte limit', () => {
    const value = 'a'.repeat(MAX_BYTES);
    expect(byteLength(value)).toBe(MAX_BYTES);
    expect(validateListingEdit(valid({ backendSearchTerms: value })).ok).toBe(true);
  });

  it('rejects one byte over', () => {
    const value = 'a'.repeat(MAX_BYTES + 1);
    expect(validateListingEdit(valid({ backendSearchTerms: value })).ok).toBe(false);
  });

  it('rejects a value under the character limit but over the byte limit', () => {
    // The case the whole rule exists for: 246 characters, 261 bytes. A
    // character-based check would accept this and Amazon would discard the
    // overflow without telling anyone.
    const value =
      'chaqueta impermeable montaña senderismo cortavientos montañismo excursión impermeável técnica respirável capucha ajustável costuras seladas à prova d água corta-vento montanhismo caminhada trilha leve señora niño pequeño árbol otoño verão inverno';
    expect(value.length).toBeLessThan(MAX_BYTES);
    expect(byteLength(value)).toBeGreaterThan(MAX_BYTES);

    const result = validateListingEdit(valid({ backendSearchTerms: value }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.backendSearchTerms).toContain('bytes, not characters');
  });

  it('rejects CJK text that fits by characters and not by bytes', () => {
    // Three bytes each: 100 characters is 300 bytes.
    const value = '帐'.repeat(100);
    expect(value.length).toBeLessThan(MAX_BYTES);
    expect(byteLength(value)).toBe(300);
    expect(validateListingEdit(valid({ backendSearchTerms: value })).ok).toBe(false);
  });

  it('measures the trimmed value, so surrounding space cannot tip it over', () => {
    const value = `${' '.repeat(20)}${'a'.repeat(MAX_BYTES)}${' '.repeat(20)}`;
    const result = validateListingEdit(valid({ backendSearchTerms: value }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.backendSearchTerms).toHaveLength(MAX_BYTES);
  });

  it('accepts an empty field', () => {
    // Nothing indexed is a real state the audit reports; validation does not
    // need to duplicate that judgement.
    expect(validateListingEdit(valid({ backendSearchTerms: '' })).ok).toBe(true);
  });
});

describe('failure reporting', () => {
  it('reports one message per field rather than a list per input', () => {
    const result = validateListingEdit({
      title: '',
      bullets: '',
      backendSearchTerms: 'a'.repeat(MAX_BYTES + 1),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual([
      'backendSearchTerms',
      'title',
    ]);
    expect(typeof result.errors.title).toBe('string');
  });

  it('rejects a completely malformed payload without throwing', () => {
    for (const input of [null, undefined, 42, 'nope', {}, []]) {
      const result = validateListingEdit(input);
      expect(result.ok, JSON.stringify(input)).toBe(false);
    }
  });

  it('ignores unknown fields rather than failing on them', () => {
    const result = validateListingEdit(valid({ somethingElse: 'ignored' }));
    expect(result.ok).toBe(true);
  });
});
