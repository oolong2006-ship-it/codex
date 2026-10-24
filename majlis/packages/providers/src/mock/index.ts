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

  constructor(scripted: readonly AsrResult[] = []) {
    this.queue = [...scripted];
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
        ended = true;
        push({ type: "speech_ended" });
        push({ type: "final", ...this.next() });
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
        }
      },
    };
  }
}

export class MockTtsProvider implements TtsProvider {
  readonly name = "mock";

  /** Emits one small chunk per word so barge-in can be exercised. */
  async *synthesize(request: TtsRequest): AsyncIterable<Uint8Array> {
    const encoder = new TextEncoder();
    for (const word of request.text.split(/\s+/).filter(Boolean)) {
      if (request.signal?.aborted) return;
      yield encoder.encode(word);
      await Promise.resolve();
    }
  }
}

export class MockLlmProvider implements LlmProvider {
  readonly name = "mock";
  private readonly replies: string[];

  constructor(scripted: readonly string[] = []) {
    this.replies = [...scripted];
  }

  async *stream(request: LlmRequest): AsyncIterable<string> {
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
