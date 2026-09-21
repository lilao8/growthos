'use client';

import { useId, useState } from 'react';
import {
  adviseLength,
  META_DESCRIPTION_MAX,
  META_DESCRIPTION_MIN,
  META_TITLE_MAX,
  META_TITLE_MIN,
  type FieldErrors,
} from '@/domain/product-seo';
import type { Product } from '@/domain/types';
import type { SaveSeoResult } from '@/services/product-service';

/**
 * SEO metadata editor.
 *
 * Failure handling is the point of this form: an invalid entry or a storage
 * failure leaves every field exactly as typed, shows why, and lets the user try
 * again. Success is only reported after the write actually returned.
 */

type FormStatus = 'idle' | 'saving' | 'saved' | 'invalid' | 'error';

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint: string;
  error: string | undefined;
  multiline?: boolean;
  advisory?: { min: number; max: number };
  testId: string;
}

function Field({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  multiline = false,
  advisory,
  testId,
}: FieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const length = value.trim().length;
  const advice =
    advisory === undefined ? null : adviseLength(value, advisory.min, advisory.max);

  const adviceText =
    advice === null
      ? null
      : advice === 'ok'
        ? `${length} characters — within the ${advisory?.min}–${advisory?.max} guideline`
        : advice === 'short'
          ? `${length} characters — shorter than the ${advisory?.min}–${advisory?.max} guideline`
          : `${length} characters — longer than the ${advisory?.min}–${advisory?.max} guideline`;

  const shared = {
    id,
    value,
    'data-testid': testId,
    'aria-describedby': error === undefined ? hintId : `${hintId} ${errorId}`,
    'aria-invalid': error !== undefined,
    className:
      'mt-2 w-full rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] aria-[invalid=true]:border-[var(--color-ink)]',
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => onChange(event.target.value),
  };

  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {multiline ? (
        <textarea {...shared} rows={3} />
      ) : (
        <input {...shared} type="text" />
      )}
      <p id={hintId} className="mt-1 text-xs text-[var(--color-ink-muted)]">
        {hint}
        {adviceText !== null && <> · {adviceText}</>}
      </p>
      {error !== undefined && (
        <p
          id={errorId}
          className="mt-1 text-xs font-medium"
          data-testid={`${testId}-error`}
        >
          {error}
        </p>
      )}
    </div>
  );
}

export function SeoMetadataForm({
  product,
  onSave,
}: {
  product: Product;
  onSave: (input: {
    primaryKeyword: string;
    metaTitle: string;
    metaDescription: string;
  }) => Promise<SaveSeoResult>;
}) {
  const baseId = useId();
  const [primaryKeyword, setPrimaryKeyword] = useState(product.primaryKeyword);
  const [metaTitle, setMetaTitle] = useState(product.metaTitle);
  const [metaDescription, setMetaDescription] = useState(
    product.metaDescription,
  );
  const [status, setStatus] = useState<FormStatus>('idle');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus('saving');
    setErrors({});
    setMessage('');

    const result = await onSave({ primaryKeyword, metaTitle, metaDescription });

    if (result.status === 'invalid') {
      // Nothing was written and nothing typed is discarded.
      setErrors(result.errors);
      setStatus('invalid');
      setMessage('Nothing was saved. Fix the fields below and try again.');
      return;
    }
    if (result.status === 'error') {
      setStatus('error');
      setMessage(`${result.message} Your changes are still here — try again.`);
      return;
    }
    setStatus('saved');
    setMessage('Saved. This change persists across a page refresh.');
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <Field
        id={`${baseId}-keyword`}
        label="Primary keyword"
        value={primaryKeyword}
        onChange={setPrimaryKeyword}
        hint="The one query this page should be the best answer to."
        error={errors.primaryKeyword}
        testId="field-primary-keyword"
      />
      <Field
        id={`${baseId}-title`}
        label="Meta title"
        value={metaTitle}
        onChange={setMetaTitle}
        hint={`Project guidance is ${META_TITLE_MIN}–${META_TITLE_MAX} characters — roughly what fits in a result before truncation, not a ranking rule.`}
        error={errors.metaTitle}
        advisory={{ min: META_TITLE_MIN, max: META_TITLE_MAX }}
        testId="field-meta-title"
      />
      <Field
        id={`${baseId}-description`}
        label="Meta description"
        value={metaDescription}
        onChange={setMetaDescription}
        hint={`Project guidance is ${META_DESCRIPTION_MIN}–${META_DESCRIPTION_MAX} characters. Descriptions do not affect ranking directly.`}
        error={errors.metaDescription}
        advisory={{ min: META_DESCRIPTION_MIN, max: META_DESCRIPTION_MAX }}
        multiline
        testId="field-meta-description"
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={status === 'saving'}
          data-testid="save-seo"
          className="rounded-md border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-60"
        >
          {status === 'saving' ? 'Saving…' : 'Save SEO metadata'}
        </button>

        {message !== '' && (
          <p
            role={status === 'saved' ? 'status' : 'alert'}
            data-testid={status === 'saved' ? 'save-success' : 'save-failure'}
            className="text-sm"
          >
            {message}
          </p>
        )}
      </div>

      <p className="text-xs text-[var(--color-ink-muted)]">
        Saving also updates this product&apos;s page snapshot, which is the
        input the SEO and GEO audits will read.
      </p>
    </form>
  );
}
