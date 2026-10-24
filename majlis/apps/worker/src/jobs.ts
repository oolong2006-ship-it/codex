/**
 * Job catalog. Handlers are registered as each phase lands; the queue
 * (BullMQ on Redis) is wired once the first real job exists.
 */
export const JOBS = {
  finalTranscription: "final-transcription",
  analyzeSession: "analyze-session",
  updatePersonas: "update-personas",
  retentionSweep: "retention-sweep",
} as const;

export type JobName = (typeof JOBS)[keyof typeof JOBS];

export type JobHandler = (payload: unknown) => Promise<void>;

export class JobRegistry {
  private readonly handlers = new Map<JobName, JobHandler>();

  register(name: JobName, handler: JobHandler): void {
    if (this.handlers.has(name)) throw new Error(`Job "${name}" already registered`);
    this.handlers.set(name, handler);
  }

  async run(name: JobName, payload: unknown): Promise<void> {
    const handler = this.handlers.get(name);
    if (!handler) throw new Error(`No handler registered for job "${name}"`);
    await handler(payload);
  }

  registered(): JobName[] {
    return [...this.handlers.keys()];
  }
}
