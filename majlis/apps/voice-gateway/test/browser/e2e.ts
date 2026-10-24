/// <reference lib="dom" />
/**
 * Real-browser check of the voice path: Chromium with a fake microphone fed from
 * a WAV file (silence, then a loud tone that acts as speech). Verifies capture,
 * playback, VAD and barge-in end to end. Run with: pnpm test:browser
 */
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { pcmToWav } from "@majlis/providers";
import { chromium } from "playwright";
import { buildServer } from "../../src/server.js";

const RATE = 48_000;
function fakeMicWav(): string {
  // 2.5 s silence (disclosure starts playing), 1 s tone (barge-in), 3 s silence.
  const seconds = [
    [2.5, 0],
    [1, 0.4],
    [3, 0],
  ] as const;
  const samples: number[] = [];
  for (const [secs, amp] of seconds) {
    for (let n = 0; n < secs * RATE; n++)
      samples.push(Math.round(amp * 32767 * Math.sin((2 * Math.PI * 220 * n) / RATE)));
  }
  const pcm = new Uint8Array(Int16Array.from(samples).buffer);
  const path = join(mkdtempSync(join(tmpdir(), "majlis-e2e-")), "mic.wav");
  writeFileSync(path, pcmToWav(pcm, RATE));
  return path;
}

const app = await buildServer({ config: { devPage: true } });
await app.listen({ port: 0, host: "127.0.0.1" });
const { port } = app.server.address() as AddressInfo;

const browser = await chromium.launch({
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${fakeMicWav()}`,
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const page = await browser.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.addInitScript(() => {
  const w = window as unknown as { __in: string[]; __out: string[]; __media: unknown[] };
  w.__in = [];
  w.__out = [];
  w.__media = [];
  const Native = window.WebSocket;
  window.WebSocket = class extends Native {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      this.addEventListener("message", (e) => typeof e.data === "string" && w.__in.push(e.data));
    }
    send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      if (typeof data === "string") w.__out.push(data);
      super.send(data);
    }
  } as typeof WebSocket;
  const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = (c) => {
    w.__media.push(c);
    return getUserMedia(c);
  };
});

await page.goto(`http://127.0.0.1:${port}/dev`);
await page.click("#start");
await page.waitForTimeout(6000);

const result = await page.evaluate(() => {
  const w = window as unknown as {
    __in: string[];
    __out: string[];
    __media: MediaStreamConstraints[];
  };
  return {
    inbound: w.__in.map((m) => JSON.parse(m) as { type: string; [k: string]: unknown }),
    outbound: w.__out.map((m) => JSON.parse(m) as { type: string; [k: string]: unknown }),
    media: w.__media,
    state: document.getElementById("state")?.textContent,
    dir: document.documentElement.dir,
  };
});
await browser.close();
await app.close();

const types = result.inbound.map((m) => m.type);
const checks: [string, boolean][] = [
  ["page is RTL", result.dir === "rtl"],
  ["camera never requested", result.media.every((c) => c.video === false)],
  [
    "mic requested with echo cancellation",
    JSON.stringify(result.media).includes('"echoCancellation":true'),
  ],
  [
    "disclosure turn received",
    result.inbound.some((m) => m.type === "turn" && m.action === "disclose"),
  ],
  ["reply audio started", types.includes("audio_start")],
  [
    "browser reported playback start",
    result.outbound.some((m) => m.type === "playback" && m.state === "started"),
  ],
  [
    "speech detected from the mic",
    result.inbound.some((m) => m.type === "vad" && m.speaking === true),
  ],
  ["barge-in cancelled playback", types.includes("audio_cancel")],
  [
    "browser confirmed it stopped",
    result.outbound.some((m) => m.type === "playback" && m.state === "stopped"),
  ],
  ["no page errors", errors.length === 0],
];
for (const [name, ok] of checks) console.log(`${ok ? "✓" : "✗"} ${name}`);
if (errors.length) console.log(errors);
if (checks.some(([, ok]) => !ok)) {
  console.log(JSON.stringify(types));
  process.exit(1);
}
