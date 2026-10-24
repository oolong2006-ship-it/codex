import {
  OpenAiCompatibleEmbeddings,
  OpenAiCompatibleAsr,
  OpenAiCompatibleLlm,
  OpenAiCompatibleTts,
} from "./adapters/openai-compatible.js";
import { WhatsAppCloudProvider } from "./adapters/whatsapp-cloud.js";
import {
  MockEmbeddingProvider,
  MockAsrProvider,
  MockLlmProvider,
  MockTelephonyProvider,
  MockTtsProvider,
  MockWhatsAppProvider,
} from "./mock/index.js";
import { EMBEDDING_DIMENSIONS, type ProviderKind, type ProviderSet } from "./types.js";

type Env = Readonly<Record<string, string | undefined>>;
type Factory<K extends keyof ProviderSet> = (env: Env) => ProviderSet[K];

/** Approved policy: participant data is processed only by models hosted inside the Kingdom. */
export const ALLOWED_LOCATIONS = ["local", "in-kingdom"] as const;

export class ProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigError";
  }
}

function required(env: Env, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new ProviderConfigError(`${key} is required for the selected provider`);
  return value;
}

function endpoint(env: Env, prefix: "ASR" | "TTS" | "LLM" | "EMBEDDING") {
  const apiKey = env[`${prefix}_API_KEY`]?.trim();
  const timeout = Number(env[`${prefix}_TIMEOUT_MS`]);
  return {
    baseUrl: required(env, `${prefix}_BASE_URL`),
    model: required(env, `${prefix}_MODEL`),
    ...(apiKey ? { apiKey } : {}),
    ...(timeout > 0 ? { timeoutMs: timeout } : {}),
  };
}

/**
 * Factories per provider kind. "mock" needs nothing; every other adapter must
 * declare where it runs via <KIND>_LOCATION, and only in-Kingdom/local is accepted.
 */
const factories: { [K in keyof ProviderSet]: Record<string, Factory<K>> } = {
  asr: {
    mock: () => new MockAsrProvider(),
    "openai-compatible": (env) => new OpenAiCompatibleAsr(endpoint(env, "ASR")),
  },
  tts: {
    mock: () => new MockTtsProvider(),
    "openai-compatible": (env) =>
      new OpenAiCompatibleTts({
        ...endpoint(env, "TTS"),
        voices: {
          male: required(env, "TTS_VOICE_MALE"),
          female: required(env, "TTS_VOICE_FEMALE"),
        },
      }),
  },
  llm: {
    mock: () => new MockLlmProvider(),
    "openai-compatible": (env) => new OpenAiCompatibleLlm(endpoint(env, "LLM")),
  },
  embedding: {
    mock: () => new MockEmbeddingProvider(),
    "openai-compatible": (env) =>
      new OpenAiCompatibleEmbeddings({
        ...endpoint(env, "EMBEDDING"),
        dimensions: EMBEDDING_DIMENSIONS,
        ...(env.EMBEDDING_QUERY_PREFIX ? { queryPrefix: env.EMBEDDING_QUERY_PREFIX } : {}),
        ...(env.EMBEDDING_DOCUMENT_PREFIX ? { documentPrefix: env.EMBEDDING_DOCUMENT_PREFIX } : {}),
      }),
  },
  telephony: { mock: () => new MockTelephonyProvider() },
  whatsapp: {
    mock: () => new MockWhatsAppProvider(),
    "cloud-api": (env) => {
      // Not in-Kingdom by nature: requires a deliberate, documented decision.
      if (env.WHATSAPP_CROSS_BORDER_APPROVED !== "true") {
        throw new ProviderConfigError(
          "The WhatsApp Cloud API routes participant messages through Meta's servers outside the Kingdom. " +
            "Set WHATSAPP_CROSS_BORDER_APPROVED=true only after a documented legal approval of that transfer.",
        );
      }
      return new WhatsAppCloudProvider({
        phoneNumberId: required(env, "WHATSAPP_PHONE_NUMBER_ID"),
        accessToken: required(env, "WHATSAPP_API_TOKEN"),
        appSecret: required(env, "WHATSAPP_APP_SECRET"),
        ...(env.WHATSAPP_API_BASE ? { apiBase: env.WHATSAPP_API_BASE } : {}),
      });
    },
  },
};

export function availableProviders(kind: ProviderKind): string[] {
  return Object.keys(factories[kind]);
}

function resolve<K extends keyof ProviderSet>(kind: K, env: Env): ProviderSet[K] {
  const prefix = kind.toUpperCase();
  const name = (env[`${prefix}_PROVIDER`] ?? "mock").trim() || "mock";
  const factory = factories[kind][name];
  if (!factory) {
    throw new ProviderConfigError(
      `Unknown ${kind} provider "${name}". Available: ${availableProviders(kind).join(", ")}. ` +
        `Set ${prefix}_PROVIDER accordingly.`,
    );
  }
  if (name !== "mock" && kind !== "whatsapp") {
    const location = env[`${prefix}_LOCATION`]?.trim();
    if (!(ALLOWED_LOCATIONS as readonly (string | undefined)[]).includes(location)) {
      throw new ProviderConfigError(
        `${prefix}_LOCATION must be one of ${ALLOWED_LOCATIONS.join(", ")} (got "${location ?? ""}"). ` +
          "Only self-hosted models inside the Kingdom may process participant data.",
      );
    }
  }
  return factory(env);
}

export function createProviders(env: Env = process.env): ProviderSet {
  return {
    asr: resolve("asr", env),
    tts: resolve("tts", env),
    llm: resolve("llm", env),
    embedding: resolve("embedding", env),
    telephony: resolve("telephony", env),
    whatsapp: resolve("whatsapp", env),
  };
}
