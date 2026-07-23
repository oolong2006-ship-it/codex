import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { AlertType, Severity, IncidentType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tenantWhere, resolveOrgId } from '../common/tenant';
import { AuthenticatedUser } from '../common/types';
import { EventsGateway } from '../realtime/events.gateway';
import {
  crowdRiskScore,
  densityLevelFromPercentage,
  occupancyPercentage,
  queueMetrics,
  riskLevelFromScore,
} from '../common/analytics';
import { SCENARIOS, SCENARIO_KEYS, ScenarioConfig } from './scenarios';

interface RunningSim {
  simulationId: string;
  organizationId: string;
  scenario: ScenarioConfig;
  tick: number;
  timer: NodeJS.Timeout;
}

const TICK_MS = 3000;

@Injectable()
export class SimulatorService {
  private readonly logger = new Logger('Simulator');
  private readonly running = new Map<string, RunningSim>(); // key: organizationId

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: EventsGateway,
  ) {}

  listScenarios() {
    return SCENARIO_KEYS.map((k) => ({
      key: SCENARIOS[k].key,
      name: SCENARIOS[k].name,
      arabicName: SCENARIOS[k].arabicName,
    }));
  }

  async status(user: AuthenticatedUser) {
    const orgId = user.organizationId ?? undefined;
    const active = orgId ? this.running.get(orgId) : undefined;
    const recent = await this.prisma.simulation.findMany({
      where: tenantWhere(user, {}),
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return {
      active: active
        ? { simulationId: active.simulationId, scenario: active.scenario.key, tick: active.tick }
        : null,
      recent,
    };
  }

  async start(user: AuthenticatedUser, scenarioKey: string, eventId?: string) {
    const scenario = SCENARIOS[scenarioKey];
    if (!scenario) {
      throw new BadRequestException(`Unknown scenario '${scenarioKey}'`);
    }
    const organizationId = resolveOrgId(user);
    if (this.running.has(organizationId)) {
      await this.stop(user);
    }

    const simulation = await this.prisma.simulation.create({
      data: {
        organizationId,
        eventId,
        name: `${scenario.name} @ ${new Date().toISOString()}`,
        scenario: scenario.key,
        status: 'RUNNING',
        startedAt: new Date(),
        config: { tickMs: TICK_MS },
      },
    });

    const timer = setInterval(() => {
      this.tick(organizationId).catch((err) =>
        this.logger.error(`tick failed: ${err.message}`),
      );
    }, TICK_MS);

    this.running.set(organizationId, {
      simulationId: simulation.id,
      organizationId,
      scenario,
      tick: 0,
      timer,
    });
    this.logger.log(`Started simulation ${simulation.id} (${scenario.key})`);
    return simulation;
  }

  async stop(user: AuthenticatedUser) {
    const organizationId = resolveOrgId(user);
    const sim = this.running.get(organizationId);
    if (!sim) return { stopped: false };
    clearInterval(sim.timer);
    this.running.delete(organizationId);
    await this.prisma.simulation.update({
      where: { id: sim.simulationId },
      data: { status: 'STOPPED', stoppedAt: new Date() },
    });
    this.logger.log(`Stopped simulation ${sim.simulationId}`);
    return { stopped: true, simulationId: sim.simulationId };
  }

  /** One simulation step: perturb zones + gates, persist readings, raise alerts. */
  private async tick(organizationId: string) {
    const sim = this.running.get(organizationId);
    if (!sim) return;
    sim.tick += 1;
    const { scenario } = sim;

    const zones = await this.prisma.zone.findMany({
      where: { organizationId, deletedAt: null },
    });
    const gates = await this.prisma.gate.findMany({
      where: { organizationId, deletedAt: null },
    });

    const crowdSnapshot = [];
    for (const zone of zones) {
      const focus = scenario.focusZoneType && zone.type === scenario.focusZoneType ? 1.5 : 1;
      const baseInflow = Math.max(1, Math.round(zone.capacity * 0.02));
      const entryFlow = Math.round(baseInflow * scenario.inflowFactor * focus * (0.6 + Math.random() * 0.8));
      const exitFlow = Math.round(baseInflow * scenario.outflowFactor * (0.6 + Math.random() * 0.8));
      const occupancy = Math.max(
        0,
        Math.min(zone.capacity, zone.currentOccupancy + entryFlow - exitFlow),
      );
      const pct = occupancyPercentage(occupancy, zone.capacity);
      const riskScore = crowdRiskScore({ occupancy, capacity: zone.capacity, entryFlow, exitFlow });

      await this.prisma.zone.update({
        where: { id: zone.id },
        data: { currentOccupancy: occupancy, riskLevel: riskLevelFromScore(riskScore) },
      });
      await this.prisma.crowdReading.create({
        data: {
          organizationId,
          zoneId: zone.id,
          occupancy,
          capacity: zone.capacity,
          densityLevel: densityLevelFromPercentage(pct),
          entryFlow,
          exitFlow,
          avgSpeed: Math.round((1.4 - pct / 100) * 100) / 100,
          riskScore,
        },
      });

      crowdSnapshot.push({ zoneId: zone.id, zoneName: zone.name, occupancy, occupancyPercentage: pct, riskScore, riskLevel: riskLevelFromScore(riskScore) });

      // Raise a crowd-density alert when a zone becomes critical.
      if (riskScore >= 90) {
        await this.raiseAlert(organizationId, {
          type: 'CROWD_DENSITY',
          severity: 'CRITICAL',
          zoneId: zone.id,
          message: `Critical crowd density in ${zone.name} (${pct}%)`,
          recommendedAction: 'TEMPORARY_ENTRY_HOLD, DISPATCH_FIELD_TEAM',
        });
      }
    }

    for (const gate of gates) {
      const arrivalRate = Math.max(0, Math.round(gate.maxCapacityPerMinute * scenario.inflowFactor * (0.5 + Math.random())));
      const serviceRate = Math.max(1, Math.round(gate.maxCapacityPerMinute * scenario.outflowFactor));
      const queueLength = Math.max(0, Math.round((arrivalRate - serviceRate) * (2 + Math.random() * 6)));
      const metrics = queueMetrics({ queueLength, arrivalRate, serviceRate });
      await this.prisma.queueReading.create({
        data: {
          organizationId,
          gateId: gate.id,
          type: 'GATE',
          queueLength,
          arrivalRate,
          serviceRate,
          waitingTime: metrics.waitingTime,
          riskScore: metrics.riskScore,
        },
      });
      if (metrics.waitingTime > 25) {
        await this.raiseAlert(organizationId, {
          type: 'QUEUE_TIME',
          severity: metrics.riskScore >= 90 ? 'CRITICAL' : 'HIGH',
          message: `Long queue at gate ${gate.code}: ~${metrics.waitingTime} min wait`,
          recommendedAction: metrics.recommendations.join(', '),
        });
      }
    }

    // Scenario-driven incident spawning.
    if (Math.random() < scenario.incidentChance) {
      await this.spawnIncident(organizationId, scenario);
    }
    // Device disruption (camera/sensor offline).
    if (Math.random() < scenario.disruptionChance) {
      await this.raiseAlert(organizationId, {
        type: 'CAMERA_OFFLINE',
        severity: 'MEDIUM',
        message: 'A monitoring device went offline',
        recommendedAction: 'DISPATCH_TECHNICIAN',
      });
    }

    await this.prisma.simulationEvent.create({
      data: {
        simulationId: sim.simulationId,
        tick: sim.tick,
        kind: 'SNAPSHOT',
        payload: { zones: crowdSnapshot.length, scenario: scenario.key },
      },
    });

    this.gateway.emitToOrg(organizationId, 'sim:tick', {
      tick: sim.tick,
      scenario: scenario.key,
      crowd: crowdSnapshot,
    });
  }

  private async raiseAlert(
    organizationId: string,
    data: { type: AlertType; severity: Severity; message: string; recommendedAction?: string; zoneId?: string },
  ) {
    const alert = await this.prisma.alert.create({
      data: {
        organizationId,
        type: data.type,
        severity: data.severity,
        message: data.message,
        recommendedAction: data.recommendedAction,
        zoneId: data.zoneId,
        source: 'SIMULATOR',
        confidenceScore: 0.85,
      },
    });
    this.gateway.emitToOrg(organizationId, 'alert:new', alert);
  }

  private async spawnIncident(organizationId: string, scenario: ScenarioConfig) {
    const typeByScenario: Record<string, IncidentType> = {
      GATE_FAILURE: 'GATE_FAILURE',
      CROWD_SURGE: 'CROWD_SURGE',
      TRANSPORT_DELAY: 'TRANSPORT_DELAY',
      EMERGENCY_EVACUATION: 'EVACUATION',
      FOOD_ZONE_CONGESTION: 'FOOD_SAFETY',
    };
    const type = typeByScenario[scenario.key] ?? 'SECURITY_ISSUE';
    const count = await this.prisma.incident.count({ where: { organizationId } });
    const incident = await this.prisma.incident.create({
      data: {
        organizationId,
        number: `INC-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`,
        type,
        severity: 'HIGH',
        description: `[Simulated] ${type} generated by scenario ${scenario.key}`,
        slaDueAt: new Date(Date.now() + 30 * 60_000),
      },
    });
    this.gateway.emitToOrg(organizationId, 'incident:new', incident);
  }
}
