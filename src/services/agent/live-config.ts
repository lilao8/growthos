import type { ModelClient } from './model';
import type { AgentLimits } from './orchestrator';
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
  | { ok: true; model: ModelClient; limits: Partial<AgentLimits> }
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
  const limits = limitsFromEnv(env);
  if (env['AGENT_MODEL_PROVIDER'] === 'scripted') return { ok: true, model: createDemoModel(), limits };
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
    const reasoningEffort = env['AGENT_REASONING_EFFORT'] ?? '';
    return {
      ok: true,
      model: createOpenAIModel(reasoningEffort === '' ? { apiKey, model } : { apiKey, model, reasoningEffort }),
      limits,
    };
  }
  return {
    ok: false,
    status: 503,
    error: 'model-not-configured',
    message: 'No model provider is configured for live analysis.',
  };
}

/**
 * Per-deployment overrides of the model budget and the turn timeout. An
 * account with a low tokens-per-minute limit needs smaller requests and room
 * to wait out a rate limit; the defaults stay as decided (D5). Anything that
 * is not a positive whole number is ignored.
 */
export function limitsFromEnv(env: Readonly<Record<string, string | undefined>>): Partial<AgentLimits> {
  const read = (name: string): number | undefined => {
    const value = Number(env[name]);
    return Number.isInteger(value) && value > 0 ? value : undefined;
  };
  const limits: Partial<AgentLimits> = {};
  const input = read('AGENT_MAX_INPUT_CHARS');
  const tool = read('AGENT_MAX_TOOL_RESULT_CHARS');
  const timeout = read('AGENT_TURN_TIMEOUT_MS');
  if (input !== undefined) limits.maxInputChars = input;
  if (tool !== undefined) limits.maxToolResultChars = tool;
  if (timeout !== undefined) limits.turnTimeoutMs = timeout;
  return limits;
}
