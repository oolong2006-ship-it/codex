import type { LatencySummary, TurnLatency } from "@majlis/voice-client/protocol";

export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = ((sorted.length - 1) * p) / 100;
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (rank - lo);
}

/** Per-session latency record; its summary is what gets stored as Session.latencyStats. */
export class LatencyTracker {
  readonly turns: TurnLatency[] = [];
  readonly perceived: number[] = [];
  readonly bargeInCancel: number[] = [];

  addTurn(turn: TurnLatency): void {
    this.turns.push(turn);
  }

  addPerceived(ms: number): void {
    this.perceived.push(ms);
  }

  addBargeIn(cancelMs: number): void {
    this.bargeInCancel.push(cancelMs);
  }

  summary(): LatencySummary {
    const response = this.turns.map((t) => t.responseMs);
    return {
      turns: this.turns.length,
      responseMs: { p50: percentile(response, 50), p90: percentile(response, 90) },
      perceivedMs: { p50: percentile(this.perceived, 50), p90: percentile(this.perceived, 90) },
      bargeIns: this.bargeInCancel.length,
      bargeInCancelMs: {
        p50: percentile(this.bargeInCancel, 50),
        max: this.bargeInCancel.length ? Math.max(...this.bargeInCancel) : null,
      },
    };
  }
}
