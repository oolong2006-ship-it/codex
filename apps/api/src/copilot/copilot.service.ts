import { Injectable, Logger } from '@nestjs/common';
import { AlertStatus, IncidentStatus, Severity } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tenantWhere } from '../common/tenant';
import { AuthenticatedUser } from '../common/types';
import { CrowdService } from '../crowd/crowd.service';
import { QueuesService } from '../queues/queues.service';
import { isSlaBreached } from '../common/sla';
import {
  assessSituation,
  Briefing,
  buildBriefingMessages,
  CopilotConfig,
  CopilotRoute,
  parseBriefing,
  readCopilotConfig,
  ruleBasedBriefing,
  selectRoute,
  SituationLevel,
  SituationSnapshot,
} from '../common/copilot';

export type FallbackReason = 'not_configured' | 'gateway_error' | 'timeout' | 'invalid_response';

export interface BriefingResult extends Briefing {
  level: SituationLevel;
  source: 'omniroute' | 'rules';
  route: CopilotRoute;
  servedModel: string | null;
  fallbackReason: FallbackReason | null;
  latencyMs: number;
  generatedAt: string;
  cached: boolean;
}

const OPEN_INCIDENT_STATUSES = [
  IncidentStatus.OPEN,
  IncidentStatus.ACKNOWLEDGED,
  IncidentStatus.IN_PROGRESS,
  IncidentStatus.ESCALATED,
];
const ACTIVE_ALERT_STATUSES = [
  AlertStatus.NEW,
  AlertStatus.ACKNOWLEDGED,
  AlertStatus.IN_PROGRESS,
  AlertStatus.ESCALATED,
];

@Injectable()
export class CopilotService {
  private readonly logger = new Logger(CopilotService.name);
  private readonly config: CopilotConfig = readCopilotConfig(process.env);
  // Keyed by tenant + situation level: a level change bypasses the cache at once.
  private readonly cache = new Map<string, { at: number; result: BriefingResult }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly crowd: CrowdService,
    private readonly queues: QueuesService,
  ) {}

  async briefing(user: AuthenticatedUser): Promise<BriefingResult> {
    const snapshot = await this.snapshot(user);
    const level = assessSituation(snapshot);
    const key = `${user.isSuperAdmin ? '*' : user.organizationId}:${level}`;

    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.config.cacheTtlMs) {
      return { ...hit.result, cached: true };
    }

    const result = await this.generate(snapshot, level);
    this.cache.set(key, { at: Date.now(), result });
    return result;
  }

  private async snapshot(user: AuthenticatedUser): Promise<SituationSnapshot> {
    const [zones, gates, incidents, activeAlerts, criticalAlerts] = await Promise.all([
      this.crowd.current(user),
      this.queues.current(user),
      this.prisma.incident.findMany({
        where: tenantWhere(user, { status: { in: OPEN_INCIDENT_STATUSES } }),
        select: { slaDueAt: true, status: true, resolvedAt: true },
      }),
      this.prisma.alert.count({
        where: tenantWhere(user, { status: { in: ACTIVE_ALERT_STATUSES } }),
      }),
      this.prisma.alert.count({
        where: tenantWhere(user, {
          status: { in: ACTIVE_ALERT_STATUSES },
          severity: Severity.CRITICAL,
        }),
      }),
    ]);

    const now = new Date();
    const occupancy = zones.reduce((s, z) => s + z.occupancy, 0);
    const capacity = zones.reduce((s, z) => s + z.capacity, 0);
    return {
      occupancyPercentage: capacity > 0 ? Math.round((occupancy / capacity) * 1000) / 10 : 0,
      zones: zones.map((z) => ({
        name: z.zoneArabicName || z.zoneName,
        riskLevel: z.riskLevel,
        occupancyPercentage: z.occupancyPercentage,
        predicted30Percentage:
          z.capacity > 0 ? Math.round((z.predictedOccupancy['30'] / z.capacity) * 100) : 0,
      })),
      gates: gates.map((g) => ({
        name: g.gateName,
        status: g.gateStatus,
        queueLength: g.queueLength,
        waitingTime: g.waitingTime,
      })),
      openIncidents: incidents.length,
      breachedIncidents: incidents.filter((i) => isSlaBreached(i, now)).length,
      activeAlerts,
      criticalAlerts,
    };
  }

  private async generate(
    snapshot: SituationSnapshot,
    level: SituationLevel,
  ): Promise<BriefingResult> {
    const route = selectRoute(level, this.config);
    const started = Date.now();
    const finish = (
      briefing: Briefing,
      source: BriefingResult['source'],
      servedModel: string | null,
      fallbackReason: FallbackReason | null,
    ): BriefingResult => ({
      ...briefing,
      level,
      source,
      route,
      servedModel,
      fallbackReason,
      latencyMs: Date.now() - started,
      generatedAt: new Date().toISOString(),
      cached: false,
    });
    const fallback = (reason: FallbackReason) =>
      finish(ruleBasedBriefing(snapshot, level), 'rules', null, reason);

    if (!this.config.baseUrl) return fallback('not_configured');

    try {
      const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: route.model,
          messages: buildBriefingMessages(snapshot, level),
          temperature: 0.2,
          max_tokens: 700,
        }),
        signal: AbortSignal.timeout(route.timeoutMs),
      });
      if (!res.ok) {
        this.logger.warn(`OmniRoute ${route.model} answered HTTP ${res.status}`);
        return fallback('gateway_error');
      }
      const body = (await res.json()) as {
        model?: string;
        choices?: { message?: { content?: string } }[];
      };
      const briefing = parseBriefing(body.choices?.[0]?.message?.content);
      if (!briefing) return fallback('invalid_response');
      if (briefing.actions.length === 0) {
        briefing.actions = ruleBasedBriefing(snapshot, level).actions;
      }
      return finish(briefing, 'omniroute', body.model ?? route.model, null);
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'TimeoutError';
      this.logger.warn(`OmniRoute ${route.model} failed: ${(err as Error).message}`);
      return fallback(timedOut ? 'timeout' : 'gateway_error');
    }
  }
}
