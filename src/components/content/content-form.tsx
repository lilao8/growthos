'use client';

import { useId, useState } from 'react';
import type { ContentFieldErrors } from '@/domain/content/content-validation';
import { opportunityBreakdown } from '@/domain/content/opportunity';
import {
  CONTENT_STATUSES,
  CONTENT_TYPES,
  FUNNEL_STAGES_CONTENT,
  SEARCH_INTENTS,
  type ContentIdea,
  type Product,
} from '@/domain/types';
import type { SaveContentResult } from '@/services/content-service';

/**
 * Create / edit form for a content idea.
 *
 * Same failure contract as the product form: an invalid entry or a storage
 * failure keeps every field exactly as typed and says what went wrong. Success
 * is only reported once the write has returned.
 */

export interface ContentFormValues {
  topic: string;
  primaryKeyword: string;
  secondaryKeywords: string;
  searchIntent: string;
  funnelStage: string;
  contentType: string;
  status: string;
  targetProductId: string;
  seoOpportunity: string;
  geoOpportunity: string;
  productRelevance: string;
}

export function valuesFromIdea(idea: ContentIdea): ContentFormValues {
  return {
    topic: idea.topic,
    primaryKeyword: idea.primaryKeyword,
    secondaryKeywords: idea.secondaryKeywords.join(', '),
    searchIntent: idea.searchIntent,
    funnelStage: idea.funnelStage,
    contentType: idea.contentType,
    status: idea.status,
    targetProductId: idea.targetProductId ?? '',
    seoOpportunity: String(idea.seoOpportunity),
    geoOpportunity: String(idea.geoOpportunity),
    productRelevance: String(idea.productRelevance),
  };
}

export const BLANK_CONTENT_FORM: ContentFormValues = {
  topic: '',
  primaryKeyword: '',
  secondaryKeywords: '',
  searchIntent: 'Informational',
  funnelStage: 'TOFU',
  contentType: 'Blog',
  status: 'Idea',
  targetProductId: '',
  seoOpportunity: '50',
  geoOpportunity: '50',
  productRelevance: '50',
};

type FormStatus = 'idle' | 'saving' | 'saved' | 'invalid' | 'error';

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint !== undefined && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-[var(--color-ink-muted)]">
          {hint}
        </p>
      )}
      {error !== undefined && (
        <p className="mt-1 text-xs font-medium" data-testid={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

const inputClass =
  'mt-2 w-full rounded-md border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]';

export function ContentForm({
  initial,
  products,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: ContentFormValues;
  products: readonly Product[];
  submitLabel: string;
  onSubmit: (values: ContentFormValues) => Promise<SaveContentResult>;
  onCancel?: () => void;
}) {
  const baseId = useId();
  const [values, setValues] = useState<ContentFormValues>(initial);
  const [errors, setErrors] = useState<ContentFieldErrors>({});
  const [status, setStatus] = useState<FormStatus>('idle');
  const [message, setMessage] = useState('');

  const set = <K extends keyof ContentFormValues>(
    key: K,
    value: ContentFormValues[K],
  ): void => setValues((current) => ({ ...current, [key]: value }));

  // A live preview of the score, so the effect of each judgement is visible
  // while it is being entered.
  const preview = opportunityBreakdown({
    seoOpportunity: Number(values.seoOpportunity),
    geoOpportunity: Number(values.geoOpportunity),
    searchIntent: (SEARCH_INTENTS.find(
      (intent) => intent === values.searchIntent,
    ) ?? 'Informational') as (typeof SEARCH_INTENTS)[number],
    productRelevance: Number(values.productRelevance),
  });

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setStatus('saving');
    setErrors({});
    setMessage('');

    const result = await onSubmit(values);

    if (result.status === 'invalid') {
      setErrors(result.errors);
      setStatus('invalid');
      setMessage('Nothing was saved. Fix the fields below and try again.');
      return;
    }
    if (result.status === 'error') {
      setStatus('error');
      setMessage(`${result.message} Your entries are still here — try again.`);
      return;
    }
    setStatus('saved');
    setMessage('Saved. This change persists across a page refresh.');
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <Field
        id={`${baseId}-topic`}
        label="Topic"
        hint="What the piece is about, in the words you would brief a writer with."
        error={errors.topic}
      >
        <input
          id={`${baseId}-topic`}
          type="text"
          value={values.topic}
          onChange={(event) => set('topic', event.target.value)}
          data-testid="content-topic"
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field
          id={`${baseId}-keyword`}
          label="Primary keyword"
          hint="The one query this piece should answer best."
          error={errors.primaryKeyword}
        >
          <input
            id={`${baseId}-keyword`}
            type="text"
            value={values.primaryKeyword}
            onChange={(event) => set('primaryKeyword', event.target.value)}
            data-testid="content-primary-keyword"
            className={inputClass}
          />
        </Field>

        <Field
          id={`${baseId}-secondary`}
          label="Secondary keywords"
          hint="Comma separated. Optional."
          error={errors.secondaryKeywords}
        >
          <input
            id={`${baseId}-secondary`}
            type="text"
            value={values.secondaryKeywords}
            onChange={(event) => set('secondaryKeywords', event.target.value)}
            data-testid="content-secondary-keywords"
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Field
          id={`${baseId}-intent`}
          label="Search intent"
          error={errors.searchIntent}
        >
          <select
            id={`${baseId}-intent`}
            value={values.searchIntent}
            onChange={(event) => set('searchIntent', event.target.value)}
            data-testid="content-search-intent"
            className={inputClass}
          >
            {SEARCH_INTENTS.map((intent) => (
              <option key={intent} value={intent}>
                {intent}
              </option>
            ))}
          </select>
        </Field>

        <Field
          id={`${baseId}-stage`}
          label="Funnel stage"
          error={errors.funnelStage}
        >
          <select
            id={`${baseId}-stage`}
            value={values.funnelStage}
            onChange={(event) => set('funnelStage', event.target.value)}
            data-testid="content-funnel-stage"
            className={inputClass}
          >
            {FUNNEL_STAGES_CONTENT.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </select>
        </Field>

        <Field
          id={`${baseId}-type`}
          label="Content type"
          error={errors.contentType}
        >
          <select
            id={`${baseId}-type`}
            value={values.contentType}
            onChange={(event) => set('contentType', event.target.value)}
            data-testid="content-type"
            className={inputClass}
          >
            {CONTENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </Field>

        <Field id={`${baseId}-status`} label="Status" error={errors.status}>
          <select
            id={`${baseId}-status`}
            value={values.status}
            onChange={(event) => set('status', event.target.value)}
            data-testid="content-status"
            className={inputClass}
          >
            {CONTENT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        id={`${baseId}-product`}
        label="Target product"
        hint="Optional. The product this piece is meant to sell."
        error={errors.targetProductId}
      >
        <select
          id={`${baseId}-product`}
          value={values.targetProductId}
          onChange={(event) => set('targetProductId', event.target.value)}
          data-testid="content-target-product"
          className={inputClass}
        >
          <option value="">No target product</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.title}
            </option>
          ))}
        </select>
      </Field>

      <fieldset className="rounded-md border border-[var(--color-line)] px-4 py-3">
        <legend className="px-1 text-sm font-medium">
          Opportunity estimates
        </legend>
        <p className="text-xs text-[var(--color-ink-muted)]">
          Your judgement, on a 0–100 scale. These are not the SEO or GEO audit
          scores, which measure an existing page, and they are not search volume
          — this project connects to no keyword tool.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Field
            id={`${baseId}-seo`}
            label="SEO opportunity"
            hint="Weight 0.35"
            error={errors.seoOpportunity}
          >
            <input
              id={`${baseId}-seo`}
              type="number"
              min={0}
              max={100}
              value={values.seoOpportunity}
              onChange={(event) => set('seoOpportunity', event.target.value)}
              data-testid="content-seo-opportunity"
              className={inputClass}
            />
          </Field>
          <Field
            id={`${baseId}-geo`}
            label="GEO opportunity"
            hint="Weight 0.25"
            error={errors.geoOpportunity}
          >
            <input
              id={`${baseId}-geo`}
              type="number"
              min={0}
              max={100}
              value={values.geoOpportunity}
              onChange={(event) => set('geoOpportunity', event.target.value)}
              data-testid="content-geo-opportunity"
              className={inputClass}
            />
          </Field>
          <Field
            id={`${baseId}-relevance`}
            label="Product relevance"
            hint="Weight 0.20"
            error={errors.productRelevance}
          >
            <input
              id={`${baseId}-relevance`}
              type="number"
              min={0}
              max={100}
              value={values.productRelevance}
              onChange={(event) => set('productRelevance', event.target.value)}
              data-testid="content-product-relevance"
              className={inputClass}
            />
          </Field>
        </div>
        <p className="mt-3 text-sm">
          Opportunity score preview:{' '}
          <span className="font-semibold tabular-nums" data-testid="score-preview">
            {preview.score}
          </span>{' '}
          <span className="text-xs text-[var(--color-ink-muted)]">
            (commercial intent contributes{' '}
            {preview.parts.find((part) => part.key === 'commercialIntent')?.input}{' '}
            at weight 0.20, derived from the search intent)
          </span>
        </p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={status === 'saving'}
          data-testid="content-save"
          className="rounded-md border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-60"
        >
          {status === 'saving' ? 'Saving…' : submitLabel}
        </button>
        {onCancel !== undefined && (
          <button
            type="button"
            onClick={onCancel}
            data-testid="content-cancel"
            className="rounded-md border border-[var(--color-line-strong)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            Cancel
          </button>
        )}
        {message !== '' && (
          <p
            role={status === 'saved' ? 'status' : 'alert'}
            data-testid={
              status === 'saved' ? 'content-save-success' : 'content-save-failure'
            }
            className="text-sm"
          >
            {message}
          </p>
        )}
      </div>
    </form>
  );
}
