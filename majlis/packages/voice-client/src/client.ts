import { WORKLET_SOURCE, int16ToFloat32, rms } from "./audio.js";
import {
  PROTOCOL_VERSION,
  parseServerMessage,
  type ClientMessage,
  type LatencySummary,
  type Mode,
  type ServerMessage,
  type VoiceGender,
} from "./protocol.js";

export type ClientState = "connecting" | "listening" | "speaking" | "ended" | "error";

export interface VoiceClientOptions {
  url: string;
  mode: Mode;
  voiceGender: VoiceGender;
  participantGender?: VoiceGender;
  onTurn?: (turn: Extract<ServerMessage, { type: "turn" }>) => void;
  onState?: (state: ClientState) => void;
  /** Microphone or playback level 0..1 for a calm waveform indicator. */
  onLevel?: (level: number, source: "mic" | "playback") => void;
  onEnded?: (reason: string, latency: LatencySummary) => void;
  onError?: (message: string) => void;
}

/**
 * Participant-side client. Voice only: the camera is never requested.
 * Playback is cancelled the moment the gateway reports barge-in.
 */
export class VoiceClient {
  private ws: WebSocket | null = null;
  private ctx: AudioContext | null = null;
  private mic: MediaStream | null = null;
  private capture: AudioWorkletNode | null = null;
  private playbackRate = 24_000;
  private currentTurn = "";
  private nextStart = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private streamEnded = false;
  private startedTurns = new Set<string>();
  private mode: Mode;

  constructor(private readonly options: VoiceClientOptions) {
    this.mode = options.mode;
  }

  async connect(): Promise<void> {
    this.options.onState?.("connecting");
    if (this.mode === "voice") await this.startAudio();
    const ws = new WebSocket(this.options.url);
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    ws.onopen = () =>
      this.send({
        type: "hello",
        protocol: PROTOCOL_VERSION,
        mode: this.mode,
        voiceGender: this.options.voiceGender,
        ...(this.options.participantGender
          ? { participantGender: this.options.participantGender }
          : {}),
      });
    ws.onmessage = (event) => {
      if (typeof event.data === "string") this.onMessage(parseServerMessage(event.data));
      else this.onAudio(event.data as ArrayBuffer);
    };
    ws.onerror = () => this.fail("connection error");
    ws.onclose = () => this.options.onState?.("ended");
  }

  sendText(text: string): void {
    this.send({ type: "text", text });
  }

  async setMode(mode: Mode): Promise<void> {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === "text") {
      this.stopPlayback();
      this.stopMic();
    } else {
      await this.startAudio();
    }
    this.send({ type: "mode", mode });
  }

  close(): void {
    this.send({ type: "end" });
    this.ws?.close();
    this.stopPlayback();
    this.stopMic();
    void this.ctx?.close();
  }

  // ─── audio ──────────────────────────────────────────────────────────────────

  private async startAudio(): Promise<void> {
    this.ctx ??= new AudioContext();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.mic = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
      video: false,
    });
    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "text/javascript" }));
    await this.ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const source = this.ctx.createMediaStreamSource(this.mic);
    this.capture = new AudioWorkletNode(this.ctx, "majlis-capture");
    this.capture.port.onmessage = (event: MessageEvent<Int16Array>) => {
      this.options.onLevel?.(rms(event.data), "mic");
      if (this.ws?.readyState === WebSocket.OPEN && this.mode === "voice") {
        this.ws.send(event.data.buffer);
      }
    };
    source.connect(this.capture);
  }

  private stopMic(): void {
    this.capture?.disconnect();
    this.capture = null;
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null;
  }

  private onAudio(bytes: ArrayBuffer): void {
    if (!this.ctx || !this.currentTurn) return;
    const samples = int16ToFloat32(bytes);
    const buffer = this.ctx.createBuffer(1, samples.length, this.playbackRate);
    buffer.copyToChannel(samples, 0);
    const node = this.ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(this.ctx.destination);
    this.nextStart = Math.max(this.nextStart, this.ctx.currentTime + 0.02);
    node.start(this.nextStart);
    this.nextStart += buffer.duration;
    this.sources.add(node);
    const turnId = this.currentTurn;
    if (!this.startedTurns.has(turnId)) {
      this.startedTurns.add(turnId);
      this.send({ type: "playback", turnId, state: "started" });
      this.options.onState?.("speaking");
    }
    this.options.onLevel?.(rms(samples), "playback");
    node.onended = () => {
      this.sources.delete(node);
      if (this.sources.size === 0 && this.streamEnded && turnId === this.currentTurn) {
        this.send({ type: "playback", turnId, state: "ended" });
        this.options.onState?.("listening");
      }
    };
  }

  private stopPlayback(): void {
    for (const node of this.sources) {
      node.onended = null;
      try {
        node.stop();
      } catch {
        // already stopped
      }
    }
    this.sources.clear();
    this.nextStart = 0;
  }

  // ─── protocol ───────────────────────────────────────────────────────────────

  private onMessage(msg: ServerMessage | null): void {
    if (!msg) return;
    switch (msg.type) {
      case "ready":
        this.options.onState?.("listening");
        break;
      case "turn":
        this.options.onTurn?.(msg);
        break;
      case "audio_start":
        this.currentTurn = msg.turnId;
        this.playbackRate = msg.sampleRate;
        this.streamEnded = false;
        break;
      case "audio_end":
        this.streamEnded = true;
        if (this.sources.size === 0 && msg.turnId === this.currentTurn) {
          this.send({ type: "playback", turnId: msg.turnId, state: "ended" });
          this.options.onState?.("listening");
        }
        break;
      case "audio_cancel":
        if (msg.turnId === this.currentTurn) {
          this.stopPlayback();
          this.currentTurn = "";
          this.send({ type: "playback", turnId: msg.turnId, state: "stopped" });
          this.options.onState?.("listening");
        }
        break;
      case "ended":
        this.options.onEnded?.(msg.reason, msg.latency);
        break;
      case "error":
        this.fail(msg.message);
        break;
      default:
        break;
    }
  }

  private send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private fail(message: string): void {
    this.options.onState?.("error");
    this.options.onError?.(message);
  }
}
