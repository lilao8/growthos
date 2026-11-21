import type { ModelClient } from './model';
import { createDemoModel } from './scripted-model';

/**
 * Whether this deployment runs the agent live, and with which model.
 *
 * Off unless AGENT_LIVE_ENABLED is exactly "true". The public deployment
 * leaves it unset, so visitors can never trigger a model call. The provider
 * is chosen by AGENT_MODEL_PROVIDER; only the scripted stand-in exists in
 * Dispatch 19.
 */

export type LiveModel =
  | { ok: true; model: ModelClient }
  | { ok: false; status: 503; error: 'live-disabled' | 'model-not-configured'; message: string };

export function resolveLiveModel(env: Readonly<Record<string, string | undefined>>): LiveModel {
  if (env['AGENT_LIVE_ENABLED'] !== 'true') {
    return {
      ok: false,
      status: 503,
      error: 'live-disabled',
      message: 'Live analysis is not enabled in this deployment.',
    };
  }
  if (env['AGENT_MODEL_PROVIDER'] === 'scripted') return { ok: true, model: createDemoModel() };
  return {
    ok: false,
    status: 503,
    error: 'model-not-configured',
    message: 'No model provider is configured for live analysis.',
  };
}
