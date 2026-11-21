import type { ModelClient } from './model';
import { createOpenAIModel } from './openai-model';
import { createDemoModel } from './scripted-model';

/**
 * Whether this deployment runs the agent live, and with which model.
 *
 * Off unless AGENT_LIVE_ENABLED is exactly "true". The public deployment
 * leaves it unset, so visitors can never trigger a model call. The provider
 * is chosen by AGENT_MODEL_PROVIDER: "scripted" (the stand-in used by tests
 * and the local demo) or "openai" (OPENAI_API_KEY and AGENT_MODEL required).
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
  if (env['AGENT_MODEL_PROVIDER'] === 'openai') {
    const apiKey = env['OPENAI_API_KEY'] ?? '';
    const model = env['AGENT_MODEL'] ?? '';
    // Names only: a misconfiguration message never includes a value.
    const missing = [apiKey === '' ? 'OPENAI_API_KEY' : null, model === '' ? 'AGENT_MODEL' : null].filter((name): name is string => name !== null);
    if (missing.length > 0) {
      return {
        ok: false,
        status: 503,
        error: 'model-not-configured',
        message: `OpenAI is selected but ${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not set.`,
      };
    }
    return { ok: true, model: createOpenAIModel({ apiKey, model }) };
  }
  return {
    ok: false,
    status: 503,
    error: 'model-not-configured',
    message: 'No model provider is configured for live analysis.',
  };
}
