import { describe, expect, it } from 'vitest';
import {
  adviseLength,
  applySeoEdit,
  META_DESCRIPTION_MAX,
  META_DESCRIPTION_MIN,
  META_TITLE_MAX,
  META_TITLE_MIN,
  syncSnapshotWithSeoEdit,
  validateSeoEdit,
} from '@/domain/product-seo';
import { buildCatalogueProducts, buildCatalogueSnapshots } from '@/fixtures/demo-catalogue';

const valid = {
  primaryKeyword: '2 person backpacking tent',
  metaTitle: 'Ridgeline 2P Backpacking Tent | NorthTrail Outdoor',
  metaDescription:
    'A 3.9 lb freestanding two-person tent with a full-coverage rainfly, built for three-season backcountry trips.',
};

describe('validateSeoEdit', () => {
  it('accepts a well-formed edit and trims it', () => {
    const result = validateSeoEdit({
      ...valid,
      primaryKeyword: '  2 person backpacking tent  ',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.primaryKeyword).toBe('2 person backpacking tent');
  });

  it('rejects each empty field with a field-specific message', () => {
    for (const field of [
      'primaryKeyword',
      'metaTitle',
      'metaDescription',
    ] as const) {
      const result = validateSeoEdit({ ...valid, [field]: '   ' });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.errors[field]).toBeDefined();
    }
  });

  it('reports several invalid fields at once', () => {
    const result = validateSeoEdit({
      primaryKeyword: '',
      metaTitle: '',
      metaDescription: '',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual([
      'metaDescription',
      'metaTitle',
      'primaryKeyword',
    ]);
  });

  it('rejects input that is not an object at all', () => {
    expect(validateSeoEdit(null).ok).toBe(false);
    expect(validateSeoEdit('a string').ok).toBe(false);
    expect(validateSeoEdit({ primaryKeyword: 42 }).ok).toBe(false);
  });

  it('rejects absurdly long values beyond the hard limit', () => {
    const result = validateSeoEdit({ ...valid, metaTitle: 'x'.repeat(200) });
    expect(result.ok).toBe(false);
  });

  it('accepts a title outside the advisory range — guidance is not a hard rule', () => {
    const result = validateSeoEdit({ ...valid, metaTitle: 'Short title' });
    expect(result.ok).toBe(true);
  });
});

describe('adviseLength', () => {
  it('classifies against the advisory range', () => {
    expect(adviseLength('x'.repeat(10), META_TITLE_MIN, META_TITLE_MAX)).toBe('short');
    expect(adviseLength('x'.repeat(45), META_TITLE_MIN, META_TITLE_MAX)).toBe('ok');
    expect(adviseLength('x'.repeat(90), META_TITLE_MIN, META_TITLE_MAX)).toBe('long');
  });

  it('ignores surrounding whitespace when measuring', () => {
    const padded = `   ${'x'.repeat(100)}   `;
    expect(
      adviseLength(padded, META_DESCRIPTION_MIN, META_DESCRIPTION_MAX),
    ).toBe('ok');
  });
});

describe('applySeoEdit', () => {
  it('changes only the three editable fields', () => {
    const product = buildCatalogueProducts()[0];
    if (product === undefined) throw new Error('missing product');

    const updated = applySeoEdit(product, {
      primaryKeyword: 'new keyword',
      metaTitle: 'New title',
      metaDescription: 'New description',
    });

    expect(updated.primaryKeyword).toBe('new keyword');
    expect(updated.metaTitle).toBe('New title');
    expect(updated.metaDescription).toBe('New description');
    expect(updated.id).toBe(product.id);
    expect(updated.priceCents).toBe(product.priceCents);
    expect(updated.inventory).toBe(product.inventory);
    expect(updated.productDescription).toBe(product.productDescription);
  });

  it('does not mutate the original product', () => {
    const product = buildCatalogueProducts()[0];
    if (product === undefined) throw new Error('missing product');
    const before = product.metaTitle;
    applySeoEdit(product, { ...valid, metaTitle: 'Changed' });
    expect(product.metaTitle).toBe(before);
  });
});

describe('syncSnapshotWithSeoEdit', () => {
  it('moves the snapshot metadata with the product', () => {
    const snapshot = buildCatalogueSnapshots()[0];
    if (snapshot === undefined) throw new Error('missing snapshot');

    const synced = syncSnapshotWithSeoEdit(snapshot, {
      primaryKeyword: 'irrelevant to the page',
      metaTitle: 'Synced title',
      metaDescription: 'Synced description',
    });

    expect(synced.metaTitle).toBe('Synced title');
    expect(synced.metaDescription).toBe('Synced description');
  });

  it('leaves page content untouched — only metadata is edited', () => {
    const snapshot = buildCatalogueSnapshots()[0];
    if (snapshot === undefined) throw new Error('missing snapshot');

    const synced = syncSnapshotWithSeoEdit(snapshot, valid);

    expect(synced.bodyText).toBe(snapshot.bodyText);
    expect(synced.h1).toBe(snapshot.h1);
    expect(synced.headings).toEqual(snapshot.headings);
    expect(synced.canonical).toBe(snapshot.canonical);
    expect(synced.faq).toEqual(snapshot.faq);
  });
});
