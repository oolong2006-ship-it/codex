import { Injectable } from '@nestjs/common';
import {
  EventStatus,
  IncidentStatus,
  AlertStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tenantWhere } from '../common/tenant';
import { AuthenticatedUser } from '../common/types';
import { CrowdService } from '../crowd/crowd.service';
import { QueuesService } from '../queues/queues.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crowd: CrowdService,
    private readonly queues: QueuesService,
  ) {}

  /** Executive KPI overview across the tenant. */
  async overview(user: AuthenticatedUser) {
    const [activeEvents, openIncidents, activeAlerts, crowd, queues] = await Promise.all([
      this.prisma.event.count({
        where: tenantWhere(user, { status: EventStatus.ACTIVE, deletedAt: null }),
      }),
      this.prisma.incident.count({
        where: tenantWhere(user, {
          status: {
            in: [
              IncidentStatus.OPEN,
              IncidentStatus.ACKNOWLEDGED,
              IncidentStatus.IN_PROGRESS,
              IncidentStatus.ESCALATED,
            ],
          },
        }),
      }),
      this.prisma.alert.count({
        where: tenantWhere(user, {
          status: {
            in: [
              AlertStatus.NEW,
              AlertStatus.ACKNOWLEDGED,
              AlertStatus.IN_PROGRESS,
              AlertStatus.ESCALATED,
            ],
          },
        }),
      }),
      this.crowd.current(user),
      this.queues.current(user),
    ]);

    const totalOccupancy = crowd.reduce((sum, z) => sum + z.occupancy, 0);
    const totalCapacity = crowd.reduce((sum, z) => sum + z.capacity, 0);
    const highRiskZones = crowd.filter((z) => z.riskLevel === 'HIGH' || z.riskLevel === 'CRITICAL');
    const waitTimes = queues.map((q) => q.waitingTime);
    const avgQueueTime = waitTimes.length
      ? Math.round((waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length) * 10) / 10
      : 0;
    const maxQueueTime = waitTimes.length ? Math.max(...waitTimes) : 0;
    const gateThroughput = queues.reduce((sum, q) => sum + (q.serviceRate ?? 0), 0);

    return {
      kpis: {
        activeEvents,
        totalVisitors: totalOccupancy,
        currentOccupancy: totalOccupancy,
        occupancyPercentage:
          totalCapacity > 0 ? Math.round((totalOccupancy / totalCapacity) * 1000) / 10 : 0,
        averageQueueTime: avgQueueTime,
        maxQueueTime,
        activeAlerts,
        openIncidents,
        highRiskZones: highRiskZones.length,
        gateThroughput: Math.round(gateThroughput),
        predictedCongestion: highRiskZones.length > 0 ? 'ELEVATED' : 'NORMAL',
      },
      highRiskZones: highRiskZones.map((z) => ({
        zoneId: z.zoneId,
        zoneName: z.zoneName,
        riskLevel: z.riskLevel,
        occupancyPercentage: z.occupancyPercentage,
      })),
    };
  }

  /** Live snapshot used by the realtime dashboard / control room. */
  async realtime(user: AuthenticatedUser) {
    const [crowd, queues, alerts, incidents] = await Promise.all([
      this.crowd.current(user),
      this.queues.current(user),
      this.prisma.alert.findMany({
        where: tenantWhere(user, {
          status: { in: [AlertStatus.NEW, AlertStatus.ACKNOWLEDGED, AlertStatus.ESCALATED] },
        }),
        orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        take: 20,
      }),
      this.prisma.incident.findMany({
        where: tenantWhere(user, {
          status: { in: [IncidentStatus.OPEN, IncidentStatus.IN_PROGRESS, IncidentStatus.ESCALATED] },
        }),
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    return { crowd, queues, alerts, incidents, timestamp: new Date().toISOString() };
  }
}
