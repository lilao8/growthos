import type { z } from 'zod';
import type { DateWindow } from '@/domain/demo-window';
import type { EvidenceStrength } from '@/domain/agent/priority';
import type { MetricRef } from '@/domain/agent/refs';
import type {
  AuditKind,
  CheckStatus,
  Priority,
  RecommendationSource,
  Severity,
} from '@/domain/types';
import type { DemoState } from '@/repositories/types';
import type { TrafficRepository } from '@/repositories/traffic-repository';

/**
 * Agent tool contract.
 *
 * Every tool is read-only, and the type says so: `readOnly: true` is a literal,
 * and the context a tool receives has no repository with a `save`. The traffic
 * repository only loads; the catalogue arrives as a plain value. A tool that
 * wanted to write would have nothing to write with.
 */

/**
 * Where the catalogue, page snapshots and audits came from. Live runs pass the
 * visitor's own browser state; tests may pass the seed. The label travels into
 * every result so a reader can tell which one an answer was computed from.
 */
export type StateSource = 'browser-local' | 'seed';

export interface ProvidedState {
  source: StateSource;
  value: DemoState;
}

export interface ToolContext {
  traffic: TrafficRepository;
  /** null when the caller supplied none; tools that need it say so. */
  state: ProvidedState | null;
  /** Injected so on-request audits are timestamped deterministically. */
  now: () => string;
}

export interface Gap {
  code:
    | 'no-prior-window'
    | 'below-minimum-sessions'
    | 'zero-sessions'
    | 'product-not-found'
    | 'no-state'
    | 'not-audited';
  message: string;
}

export interface AuditRef {
  refId: string;
  kind: AuditKind;
  pageId: string;
  productId: string | null;
  ruleId: string;
  status: CheckStatus;
  severity: Severity;
  points: number | null;
  evidence: string | null;
  ruleVersion: string;
  /** 'stored' = the visitor's own audit; otherwise computed for this answer only. */
  origin: AuditOrigin;
  inputFingerprint: string;
  href: string;
}

export type AuditOrigin = 'stored' | 'computed-on-request';

export interface AgentFinding {
  /** Scoped so the same rule on two scopes is two findings. */
  id: string;
  source: RecommendationSource;
  ruleId: string;
  title: string;
  /** From the existing recommendation engine; never re-scored here. */
  priority: Priority;
  strength: EvidenceStrength;
  affectedSessions: number | null;
  /** What was observed, from the rule engine's own wording. */
  observed: string;
  /** How an operator could check it. Hypotheses, not diagnoses. */
  howToVerify: string;
  ruleVersion: string;
  /** Refs (metric or audit) this finding rests on. */
  refIds: string[];
  href: string;
}

export interface ToolMeta {
  window: DateWindow;
  previousWindow: DateWindow | null;
  /** Describes each data source read, e.g. "fixture:traffic". */
  dataSources: string[];
  refs: MetricRef[];
  auditRefs: AuditRef[];
  gaps: Gap[];
}

export type ToolOutcome<Data> =
  | { status: 'ok'; data: Data; meta: ToolMeta; findings: AgentFinding[] }
  | { status: 'empty'; data: Data; meta: ToolMeta; findings: [] }
  | { status: 'unsupported'; reason: string; suggestion: string }
  | { status: 'invalid-input'; issues: string[] }
  | { status: 'error'; message: string };

export interface AgentTool<Input, Data> {
  name: string;
  description: string;
  readOnly: true;
  input: z.ZodType<Input>;
  execute(input: Input, context: ToolContext): Promise<ToolOutcome<Data>>;
}
