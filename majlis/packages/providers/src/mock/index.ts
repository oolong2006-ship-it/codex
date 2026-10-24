import type {
  AsrOptions,
  AsrProvider,
  AsrResult,
  AsrStream,
  AsrStreamEvent,
  LlmProvider,
  LlmRequest,
  TelephonyProvider,
  TtsProvider,
  TtsRequest,
  WhatsAppInboundMessage,
  WhatsAppProvider,
} from "../types.js";

/**
 * Deterministic in-memory providers for tests, CI and local development.
 * They never touch the network.
 */

export class MockAsrProvider implements AsrProvider {
  readonly name = "mock";
  private readonly queue: AsrResult[];
  private readonly finalDelayMs: number;

  constructor(scripted: readonly AsrResult[] = [], options: { finalDelayMs?: number } = {}) {
    this.queue = [...scripted];
    this.finalDelayMs = options.finalDelayMs ?? 0;
  }

  /** Queues more scripted results (used by tests driving a live session). */
  script(...results: AsrResult[]): void {
    this.queue.push(...results);
  }

  private next(): AsrResult {
    return this.queue.shift() ?? { text: "", confidence: 0 };
  }

  async transcribe(_audio: Uint8Array, _options: AsrOptions): Promise<AsrResult> {
    return this.next();
  }

  startStream(_options: AsrOptions): AsrStream {
    const events: AsrStreamEvent[] = [];
    let ended = false;
    let wake: (() => void) | undefined;
    let started = false;

    const push = (event: AsrStreamEvent) => {
      events.push(event);
      wake?.();
    };

    return {
      write: () => {
        if (!started) {
          started = true;
          push({ type: "speech_started" });
        }
      },
      end: () => {
        if (ended) return;
        const result = this.next();
        const finish = () => {
          ended = true;
          push({ type: "speech_ended" });
          push({ type: "final", ...result });
        };
        if (this.finalDelayMs) setTimeout(finish, this.finalDelayMs);
        else finish();
      },
      async *[Symbol.asyncIterator]() {
        while (true) {
          const event = events.shift();
          if (event) {
            yield event;
            continue;
          }
          if (ended) return;
          await new Promise<void>((resolve) => (wake = resolve));
          wake = undefined;
        }
      },
    };
  }
}

export interface MockTtsOptions {
  /** Audio length per word. */
  msPerWord?: number;
  /** Simulated time to first audio. */
  firstChunkDelayMs?: number;
  /** Simulated time between chunks. */
  chunkDelayMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class MockTtsProvider implements TtsProvider {
  readonly name = "mock";
  constructor(private readonly options: MockTtsOptions = {}) {}

  /** One chunk of quiet PCM tone per word, so playback and barge-in can be exercised. */
  async *synthesize(request: TtsRequest): AsyncIterable<Uint8Array> {
    const { msPerWord = 200, firstChunkDelayMs = 0, chunkDelayMs = 0 } = this.options;
    const rate = request.format.sampleRateHz;
    const freq = request.voiceGender === "female" ? 330 : 220;
    const words = request.text.split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      const delay = i === 0 ? firstChunkDelayMs : chunkDelayMs;
      if (delay) await sleep(delay);
      if (request.signal?.aborted) return;
      const samples = Math.round((rate * msPerWord) / 1000);
      const pcm = new Int16Array(samples);
      for (let n = 0; n < samples; n++) {
        pcm[n] = Math.round(2000 * Math.sin((2 * Math.PI * freq * n) / rate));
      }
      yield new Uint8Array(pcm.buffer);
      await Promise.resolve();
    }
  }
}

export class MockLlmProvider implements LlmProvider {
  readonly name = "mock";
  private readonly replies: string[];

  constructor(
    scripted: readonly string[] = [],
    private readonly options: { delayMs?: number } = {},
  ) {
    this.replies = [...scripted];
  }

  async *stream(request: LlmRequest): AsyncIterable<string> {
    if (this.options.delayMs) await sleep(this.options.delayMs);
    const reply = this.replies.shift() ?? "";
    for (const token of reply.split(/(?<=\s)/)) {
      if (request.signal?.aborted) return;
      yield token;
    }
  }

  async complete(request: LlmRequest): Promise<string> {
    let out = "";
    for await (const delta of this.stream(request)) out += delta;
    return out;
  }
}

export class MockTelephonyProvider implements TelephonyProvider {
  readonly name = "mock";
  private counter = 0;

  async startOutboundCall(): Promise<{ callId: string }> {
    this.counter += 1;
    return { callId: `mock-call-${this.counter}` };
  }

  async hangUp(): Promise<void> {}
}

export class MockWhatsAppProvider implements WhatsAppProvider {
  readonly name = "mock";
  readonly sent: {
    participantRef: string;
    kind: "text" | "audio";
    payload: string | Uint8Array;
  }[] = [];

  async sendText(participantRef: string, text: string) {
    this.sent.push({ participantRef, kind: "text", payload: text });
    return { messageId: `mock-msg-${this.sent.length}` };
  }

  async sendVoiceNote(participantRef: string, audio: Uint8Array) {
    this.sent.push({ participantRef, kind: "audio", payload: audio });
    return { messageId: `mock-msg-${this.sent.length}` };
  }

  async downloadMedia(): Promise<Uint8Array> {
    return new Uint8Array();
  }

  parseWebhook(rawBody: string): WhatsAppInboundMessage[] {
    const parsed = JSON.parse(rawBody) as { messages?: WhatsAppInboundMessage[] };
    return (parsed.messages ?? []).map((m) => ({ ...m, receivedAt: new Date(m.receivedAt) }));
  }
}
