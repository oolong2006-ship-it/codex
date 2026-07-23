import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { tenantWhere } from '../common/tenant';
import { AuthenticatedUser } from '../common/types';
import { queueMetrics, movingAverage } from '../common/analytics';

@Injectable()
export class QueuesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Current queue state per gate, computed from the latest reading. */
  async current(user: AuthenticatedUser, venueId?: string) {
    const gates = await this.prisma.gate.findMany({
      where: tenantWhere(user, { deletedAt: null, ...(venueId ? { venueId } : {}) }),
    });

    const results = [];
    for (const gate of gates) {
      const latest = await this.prisma.queueReading.findFirst({
        where: { gateId: gate.id },
        orderBy: { recordedAt: 'desc' },
      });
      const arrivalRate = latest?.arrivalRate ?? 0;
      const serviceRate = latest?.serviceRate ?? gate.maxCapacityPerMinute;
      const queueLength = latest?.queueLength ?? 0;
      const metrics = queueMetrics({ queueLength, arrivalRate, serviceRate });

      results.push({
        gateId: gate.id,
        gateName: gate.name,
        gateCode: gate.code,
        gateStatus: gate.status,
        type: 'GATE',
        arrivalRate,
        serviceRate,
        ...metrics,
        recordedAt: latest?.recordedAt ?? null,
      });
    }
    return results;
  }

  /** Short-horizon queue forecast using a moving average of recent queue lengths. */
  async forecast(user: AuthenticatedUser, gateId: string) {
    const gate = await this.prisma.gate.findFirst({ where: tenantWhere(user, { id: gateId }) });
    if (!gate) return null;
    const readings = await this.prisma.queueReading.findMany({
      where: { gateId },
      orderBy: { recordedAt: 'desc' },
      take: 15,
    });
    const lengths = readings.map((r) => r.queueLength).reverse();
    const waits = readings.map((r) => r.waitingTime).reverse();
    return {
      gateId,
      predictedQueueLength: movingAverage(lengths),
      predictedWaitingTime: movingAverage(waits),
      basedOnSamples: readings.length,
    };
  }
}
