import type {
  AsrOptions,
  AsrProvider,
  AsrResult,
  AsrStream,
  AsrStreamEvent,
  LlmProvider,
  LlmRequest,
  TtsProvider,
  TtsRequest,
} from "../types.js";

/**
 * Adapters for self-hosted inference servers that expose OpenAI-compatible
 * endpoints (vLLM, faster-whisper-server, llama.cpp, TGI and similar), run
 * inside the Kingdom. Only URLs and model names come from configuration.
 */

export interface EndpointConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs?: number;
}

function headers(cfg: EndpointConfig, extra: Record<string, string> = {}): Record<string, string> {
  return cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}`, ...extra } : extra;
}

function url(cfg: EndpointConfig, path: string): string {
  return cfg.baseUrl.replace(/\/+$/, "") + path;
}

function withTimeout(cfg: EndpointConfig, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(cfg.timeoutMs ?? 30_000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function ensureOk(res: Response, what: string): Promise<void> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${what} failed: HTTP ${res.status} ${body.slice(0, 200)}`);
  }
}

/** Wraps raw PCM s16le in a WAV header so any transcription server accepts it. */
export function pcmToWav(pcm: Uint8Array, sampleRateHz: number, channels = 1): Uint8Array {
  const header = new DataView(new ArrayBuffer(44));
  const write = (offset: number, text: string) =>
    [...text].forEach((c, i) => header.setUint8(offset + i, c.charCodeAt(0)));
  write(0, "RIFF");
  header.setUint32(4, 36 + pcm.byteLength, true);
  write(8, "WAVE");
  write(12, "fmt ");
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, channels, true);
  header.setUint32(24, sampleRateHz, true);
  header.setUint32(28, sampleRateHz * channels * 2, true);
  header.setUint16(32, channels * 2, true);
  header.setUint16(34, 16, true);
  write(36, "data");
  header.setUint32(40, pcm.byteLength, true);
  const out = new Uint8Array(44 + pcm.byteLength);
  out.set(new Uint8Array(header.buffer), 0);
  out.set(pcm, 44);
  return out;
}

export class OpenAiCompatibleAsr implements AsrProvider {
  readonly name = "openai-compatible";
  constructor(private readonly cfg: EndpointConfig) {}

  async transcribe(audio: Uint8Array, options: AsrOptions): Promise<AsrResult> {
    const wav =
      options.format.encoding === "pcm_s16le"
        ? pcmToWav(audio, options.format.sampleRateHz, options.format.channels)
        : audio;
    const form = new FormData();
    form.set("model", this.cfg.model);
    form.set("language", options.language.split("-")[0] ?? "ar");
    form.set("response_format", "verbose_json");
    if (options.phraseHints?.length) form.set("prompt", options.phraseHints.join("، "));
    form.set("file", new Blob([wav], { type: "audio/wav" }), "audio.wav");
    const res = await fetch(url(this.cfg, "/v1/audio/transcriptions"), {
      method: "POST",
      headers: headers(this.cfg),
      body: form,
      signal: withTimeout(this.cfg),
    });
    await ensureOk(res, "transcription");
    const body = (await res.json()) as {
      text?: string;
      segments?: { avg_logprob?: number }[];
    };
    const logprobs = (body.segments ?? [])
      .map((s) => s.avg_logprob)
      .filter((v): v is number => typeof v === "number");
    return {
      text: (body.text ?? "").trim(),
      ...(logprobs.length
        ? { confidence: logprobs.reduce((sum, v) => sum + Math.exp(v), 0) / logprobs.length }
        : {}),
    };
  }

  /**
   * These servers transcribe whole files, so the stream buffers audio and
   * transcribes once the gateway signals end of speech.
   */
  startStream(options: AsrOptions): AsrStream {
    const chunks: Uint8Array[] = [];
    const events: AsrStreamEvent[] = [];
    let done = false;
    let wake: (() => void) | undefined;
    const push = (e: AsrStreamEvent) => {
      events.push(e);
      wake?.();
    };
    const finish = () => {
      done = true;
      wake?.();
    };
    return {
      write: (chunk) => {
        if (chunks.length === 0) push({ type: "speech_started" });
        chunks.push(chunk);
      },
      end: () => {
        push({ type: "speech_ended" });
        const total = chunks.reduce((n, c) => n + c.byteLength, 0);
        const audio = new Uint8Array(total);
        let offset = 0;
        for (const c of chunks) {
          audio.set(c, offset);
          offset += c.byteLength;
        }
        this.transcribe(audio, options)
          .then((result) => push({ type: "final", ...result }))
          .catch(() => push({ type: "final", text: "", confidence: 0 }))
          .finally(finish);
      },
      async *[Symbol.asyncIterator]() {
        while (true) {
          const event = events.shift();
          if (event) {
            yield event;
            continue;
          }
          if (done) return;
          await new Promise<void>((resolve) => (wake = resolve));
          wake = undefined;
        }
      },
    };
  }
}

export interface TtsEndpointConfig extends EndpointConfig {
  voices: { male: string; female: string };
}

export class OpenAiCompatibleTts implements TtsProvider {
  readonly name = "openai-compatible";
  constructor(private readonly cfg: TtsEndpointConfig) {}

  async *synthesize(request: TtsRequest): AsyncIterable<Uint8Array> {
    const res = await fetch(url(this.cfg, "/v1/audio/speech"), {
      method: "POST",
      headers: headers(this.cfg, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        model: this.cfg.model,
        input: request.text,
        voice: this.cfg.voices[request.voiceGender],
        response_format: "pcm",
        sample_rate: request.format.sampleRateHz,
      }),
      signal: withTimeout(this.cfg, request.signal),
    });
    await ensureOk(res, "speech synthesis");
    if (!res.body) return;
    const reader = res.body.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) return;
        if (value?.byteLength) yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }
}

export class OpenAiCompatibleLlm implements LlmProvider {
  readonly name = "openai-compatible";
  constructor(private readonly cfg: EndpointConfig) {}

  async *stream(request: LlmRequest): AsyncIterable<string> {
    const res = await fetch(url(this.cfg, "/v1/chat/completions"), {
      method: "POST",
      headers: headers(this.cfg, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        model: this.cfg.model,
        messages: request.messages,
        stream: true,
        max_tokens: request.maxTokens ?? 200,
        temperature: request.temperature ?? 0.6,
      }),
      signal: withTimeout(this.cfg, request.signal),
    });
    await ensureOk(res, "chat completion");
    if (!res.body) return;
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") return;
        const delta = (JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] })
          .choices?.[0]?.delta?.content;
        if (delta) yield delta;
      }
    }
  }

  async complete(request: LlmRequest): Promise<string> {
    let out = "";
    for await (const delta of this.stream(request)) out += delta;
    return out;
  }
}
