import { z } from 'zod';
import type { PageSnapshot, Product, ProductSeoEdit } from './types';

/**
 * SEO metadata editing rules.
 *
 * The length bounds are this project's editing guidance for an English demo
 * store — roughly what fits in a search result before truncation. They are not
 * a search engine requirement and do not affect ranking; the audit engine in
 * Dispatch 3 treats them as warnings, never as errors.
 */

export const META_TITLE_MIN = 30;
export const META_TITLE_MAX = 60;
export const META_DESCRIPTION_MIN = 70;
export const META_DESCRIPTION_MAX = 160;

/** Hard limits that reject a save outright, as opposed to advisory guidance. */
const META_TITLE_HARD_MAX = 120;
const META_DESCRIPTION_HARD_MAX = 320;
const KEYWORD_HARD_MAX = 80;

const productSeoEditSchema = z.object({
  primaryKeyword: z
    .string()
    .trim()
    .min(1, { message: 'Primary keyword is required.' })
    .max(KEYWORD_HARD_MAX, {
      message: `Primary keyword must be ${KEYWORD_HARD_MAX} characters or fewer.`,
    }),
  metaTitle: z
    .string()
    .trim()
    .min(1, { message: 'Meta title is required.' })
    .max(META_TITLE_HARD_MAX, {
      message: `Meta title must be ${META_TITLE_HARD_MAX} characters or fewer.`,
    }),
  metaDescription: z
    .string()
    .trim()
    .min(1, { message: 'Meta description is required.' })
    .max(META_DESCRIPTION_HARD_MAX, {
      message: `Meta description must be ${META_DESCRIPTION_HARD_MAX} characters or fewer.`,
    }),
});

export type ProductSeoEditInput = z.infer<typeof productSeoEditSchema>;

export type FieldErrors = Partial<Record<keyof ProductSeoEditInput, string>>;

export type SeoEditValidation =
  | { ok: true; value: ProductSeoEdit }
  | { ok: false; errors: FieldErrors };

export function validateSeoEdit(input: unknown): SeoEditValidation {
  const parsed = productSeoEditSchema.safeParse(input);
  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }

  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (
      field === 'primaryKeyword' ||
      field === 'metaTitle' ||
      field === 'metaDescription'
    ) {
      errors[field] ??= issue.message;
    }
  }
  return { ok: false, errors };
}

/** Advisory length guidance shown live beside each field. */
export type LengthAdvice = 'short' | 'ok' | 'long';

export function adviseLength(
  value: string,
  min: number,
  max: number,
): LengthAdvice {
  const length = value.trim().length;
  if (length < min) return 'short';
  if (length > max) return 'long';
  return 'ok';
}

export function applySeoEdit(product: Product, edit: ProductSeoEdit): Product {
  return { ...product, ...edit };
}

/**
 * The page snapshot is the audit input, so editing product metadata has to move
 * the snapshot with it — otherwise an audit would grade metadata the store no
 * longer uses. Only the metadata fields change; body content is untouched.
 */
export function syncSnapshotWithSeoEdit(
  snapshot: PageSnapshot,
  edit: ProductSeoEdit,
): PageSnapshot {
  return {
    ...snapshot,
    metaTitle: edit.metaTitle,
    metaDescription: edit.metaDescription,
  };
}
