import { Badge } from '@/components/ui/badge';
import type { CheckStatus, Severity } from '@/domain/types';

/**
 * Status and severity are always spelled out in words. Colour and shape are
 * secondary, so the verdict survives greyscale printing and colour blindness.
 */

const STATUS_LABEL: Record<CheckStatus, string> = {
  pass: 'Pass',
  warning: 'Warning',
  error: 'Error',
  unknown: 'Not assessed',
};

const STATUS_MARK: Record<CheckStatus, string> = {
  pass: '✓',
  warning: '!',
  error: '✕',
  unknown: '?',
};

export function StatusBadge({ status }: { status: CheckStatus }) {
  return (
    <Badge tone={status === 'pass' ? 'neutral' : 'muted'}>
      <span aria-hidden="true" className="mr-1 font-mono">
        {STATUS_MARK[status]}
      </span>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function SeverityText({
  severity,
  status,
}: {
  severity: Severity;
  status: CheckStatus;
}) {
  // Severity only means something for a finding; a passing check has none.
  if (status === 'pass' || status === 'unknown') {
    return <span className="text-[var(--color-ink-muted)]">—</span>;
  }
  return <span className="capitalize">{severity}</span>;
}
