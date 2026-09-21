import { z } from 'zod';
import { DEFAULT_AMAZON_CONFIG } from './config';
import { byteLength } from './rules';

/**
 * Listing edit validation.
 *
 * As with the product SEO form, an invalid entry never reaches storage and the
 * caller keeps everything the user typed.
 *
 * The one rule worth stating: the backend search terms field is rejected past
 * its BYTE limit, not its character limit. Validating characters would accept
 * a value Amazon silently truncates, which is the worst kind of pass — the
 * operator sees a save confirmation and loses half the field.
 */

const BULLET_SEPARATOR = '\n';

/** Bullets arrive from a textarea as one per line. */
const bulletList = z.preprocess((value) => {
  if (typeof value === 'string') {
    return value
      .split(BULLET_SEPARATOR)
      .map((line) => line.trim())
      .filter((line) => line !== '');
  }
  return value;
}, z.array(z.string().min(1)).max(DEFAULT_AMAZON_CONFIG.bulletsExpected, {
  message: `Amazon shows at most ${DEFAULT_AMAZON_CONFIG.bulletsExpected} bullets`,
}));

const listingEditSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { message: 'Title is required.' })
    .max(DEFAULT_AMAZON_CONFIG.titleMax, {
      message: `Title must be ${DEFAULT_AMAZON_CONFIG.titleMax} characters or fewer.`,
    }),
  bullets: bulletList,
  backendSearchTerms: z.string().refine(
    (value) => byteLength(value.trim()) <= DEFAULT_AMAZON_CONFIG.backendSearchTermsMaxBytes,
    {
      message: `Backend search terms must be ${DEFAULT_AMAZON_CONFIG.backendSearchTermsMaxBytes} bytes or fewer. The limit is bytes, not characters — accented and non-Latin characters cost two to four bytes each.`,
    },
  ),
});

export type ListingEditFormValues = z.infer<typeof listingEditSchema>;

export type ListingFieldErrors = Partial<
  Record<keyof ListingEditFormValues, string>
>;

export type ListingValidation =
  | { ok: true; value: ListingEditFormValues }
  | { ok: false; errors: ListingFieldErrors };

const FIELD_KEYS = new Set<string>([
  'title',
  'bullets',
  'backendSearchTerms',
]);

export function validateListingEdit(input: unknown): ListingValidation {
  const parsed = listingEditSchema.safeParse(input);
  if (parsed.success) {
    return {
      ok: true,
      value: {
        title: parsed.data.title.trim(),
        bullets: parsed.data.bullets,
        backendSearchTerms: parsed.data.backendSearchTerms.trim(),
      },
    };
  }

  const errors: ListingFieldErrors = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && FIELD_KEYS.has(key)) {
      const field = key as keyof ListingEditFormValues;
      // Keep the first message per field: a list of every failure for one
      // input is noise next to the input itself.
      errors[field] ??= issue.message;
    }
  }
  return { ok: false, errors };
}
