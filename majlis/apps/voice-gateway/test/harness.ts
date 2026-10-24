import {
  MockAsrProvider,
  MockLlmProvider,
  MockTtsProvider,
  createProviders,
} from "@majlis/providers";
import type { AsrResult, ProviderSet } from "@majlis/providers";
import type { ConsentRecord, TranscriptEntry } from "@majlis/interviewer";
import type { ServerMessage } from "@majlis/voice-client/protocol";
import { loadConfig } from "../src/config.js";
import { Conversation, type EndStatus } from "../src/conversation.js";
import { demoGuide } from "../src/demo-guide.js";
import { InMemorySessionStore } from "../src/sessions.js";
import { silence, tone } from "./audio-helpers.js";

export interface HarnessOptions {
  tts?: ConstructorParameters<typeof MockTtsProvider>[0];
  asr?: AsrResult[];
  asrDelayMs?: number;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Drives a Conversation directly. The clock is real time plus 20 ms per audio
 * frame fed, so endpointing shows up in latency the way it would live.
 */
export async function harness(options: HarnessOptions = {}) {
  const asr = new MockAsrProvider(options.asr ?? [], {
    ...(options.asrDelayMs ? { finalDelayMs: options.asrDelayMs } : {}),
  });
  const providers: ProviderSet = {
    ...createProviders({}),
    asr,
    tts: new MockTtsProvider({ msPerWord: 20, ...options.tts }),
    llm: new MockLlmProvider(),
  };
  const session = await new InMemorySessionStore().create(demoGuide);
  const messages: ServerMessage[] = [];
  const audio: { turnId: string; bytes: number }[] = [];
  const ended: { status?: EndStatus } = {};
  const stored: TranscriptEntry[] = [];
  const recorded = new Map<TranscriptEntry, number>();
  const consents: ConsentRecord[] = [];
  let audioOffset = 0;
  let currentAudioTurn = "";

  const conversation = new Conversation({
    session,
    providers,
    config: loadConfig({}),
    seed: 11,
    now: () => performance.now() + audioOffset,
    sendJson: (msg) => {
      messages.push(msg);
      if (msg.type === "audio_start") currentAudioTurn = msg.turnId;
    },
    sendAudio: (chunk) => audio.push({ turnId: currentAudioTurn, bytes: chunk.byteLength }),
    onEnd: (status) => {
      ended.status = status;
    },
    persist: {
      turns: async (entries, _dialect, audioFor) => {
        stored.push(...entries);
        for (const e of entries) {
          const audio = audioFor(e);
          if (audio) recorded.set(e, audio.byteLength);
        }
      },
      consent: async (record) => {
        consents.push(record);
      },
    },
  });

  const feed = (frames: Int16Array[]) => {
    for (const f of frames) {
      audioOffset += 20;
      conversation.handleAudio(f);
    }
  };

  const send = (msg: object) => conversation.handleText(JSON.stringify(msg));

  const of = <T extends ServerMessage["type"]>(type: T) =>
    messages.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);

  const waitFor = async (pred: () => boolean, timeoutMs = 3000) => {
    const start = Date.now();
    while (!pred()) {
      if (Date.now() - start > timeoutMs) throw new Error("timed out waiting for condition");
      await sleep(5);
    }
  };

  /** Lets the browser report that the last reply finished playing. */
  const heard = () => {
    const last = of("audio_end").at(-1);
    if (last) send({ type: "playback", turnId: last.turnId, state: "ended" });
  };

  /** Speech of `ms` followed by end-of-turn silence. */
  const say = (ms = 400) => feed([...tone(ms), ...silence(600)]);

  return {
    conversation,
    asr,
    messages,
    audio,
    ended,
    stored,
    recorded,
    consents,
    feed,
    send,
    of,
    waitFor,
    heard,
    say,
  };
}
