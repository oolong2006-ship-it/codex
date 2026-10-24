import {
  MockAsrProvider,
  MockLlmProvider,
  MockTelephonyProvider,
  MockTtsProvider,
  MockWhatsAppProvider,
} from "./mock/index.js";
import type { ProviderKind, ProviderSet } from "./types.js";

type Env = Readonly<Record<string, string | undefined>>;
type Factory<K extends keyof ProviderSet> = (env: Env) => ProviderSet[K];

export class ProviderConfigError extends Error {
  constructor(kind: ProviderKind, name: string, available: readonly string[]) {
    super(
      `Unknown ${kind} provider "${name}". Available: ${available.join(", ")}. ` +
        `Set ${kind.toUpperCase()}_PROVIDER accordingly.`,
    );
    this.name = "ProviderConfigError";
  }
}

/**
 * Factories per provider kind. Real vendor adapters are registered here once
 * approved; until then only "mock" exists.
 */
const factories: { [K in keyof ProviderSet]: Record<string, Factory<K>> } = {
  asr: { mock: () => new MockAsrProvider() },
  tts: { mock: () => new MockTtsProvider() },
  llm: { mock: () => new MockLlmProvider() },
  telephony: { mock: () => new MockTelephonyProvider() },
  whatsapp: { mock: () => new MockWhatsAppProvider() },
};

export function availableProviders(kind: ProviderKind): string[] {
  return Object.keys(factories[kind]);
}

function resolve<K extends keyof ProviderSet>(kind: K, env: Env): ProviderSet[K] {
  const name = (env[`${kind.toUpperCase()}_PROVIDER`] ?? "mock").trim() || "mock";
  const factory = factories[kind][name];
  if (!factory) throw new ProviderConfigError(kind, name, availableProviders(kind));
  return factory(env);
}

export function createProviders(env: Env = process.env): ProviderSet {
  return {
    asr: resolve("asr", env),
    tts: resolve("tts", env),
    llm: resolve("llm", env),
    telephony: resolve("telephony", env),
    whatsapp: resolve("whatsapp", env),
  };
}
