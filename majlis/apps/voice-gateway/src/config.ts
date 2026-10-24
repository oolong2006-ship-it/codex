export interface GatewayConfig {
  port: number;
  /** Shared secret for the internal session API; the API is disabled when empty. */
  internalToken: string;
  /** Browser origins allowed to open the stream; empty allows same-host only. */
  allowedOrigins: string[];
  ttsSampleRate: number;
  vad: { thresholdDbfs: number; minSpeechMs: number; endSilenceMs: number };
  /** Let the LLM reword planned questions (adds its full generation time to latency). */
  llmRephrase: boolean;
  /** Serves /dev with a demo session; never enable in production. */
  devPage: boolean;
}

type Env = Readonly<Record<string, string | undefined>>;

const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return value !== undefined && value !== "" && Number.isFinite(n) ? n : fallback;
};

export function loadConfig(env: Env = process.env): GatewayConfig {
  return {
    port: num(env.VOICE_GATEWAY_PORT, 4100),
    internalToken: env.GATEWAY_INTERNAL_TOKEN ?? "",
    allowedOrigins: (env.GATEWAY_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    ttsSampleRate: num(env.TTS_SAMPLE_RATE, 24_000),
    vad: {
      thresholdDbfs: num(env.VAD_THRESHOLD_DBFS, -40),
      minSpeechMs: num(env.VAD_MIN_SPEECH_MS, 100),
      endSilenceMs: num(env.VAD_END_SILENCE_MS, 500),
    },
    llmRephrase: env.INTERVIEWER_LLM_REPHRASE === "true",
    devPage: env.GATEWAY_DEV_PAGE === "true",
  };
}
