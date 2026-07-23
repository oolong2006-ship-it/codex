import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { tenantWhere } from '../common/tenant';
import { AuthenticatedUser } from '../common/types';
import {
  crowdRiskScore,
  densityLevelFromPercentage,
  occupancyPercentage,
  predictOccupancy,
  riskLevelFromScore,
} from '../common/analytics';

@Injectable()
export class CrowdService {
  constructor(private readonly prisma: PrismaService) {}

  /** Current crowd state per zone, enriched with density, risk and short-horizon forecasts. */
  async current(user: AuthenticatedUser, venueId?: string) {
    const zones = await this.prisma.zone.findMany({
      where: tenantWhere(user, { deletedAt: null, ...(venueId ? { venueId } : {}) }),
    });

    const results = [];
    for (const zone of zones) {
      const latest = await this.prisma.crowdReading.findFirst({
        where: { zoneId: zone.id },
        orderBy: { recordedAt: 'desc' },
      });
      const occupancy = latest?.occupancy ?? zone.currentOccupancy;
      const capacity = zone.capacity;
      const entryFlow = latest?.entryFlow ?? 0;
      const exitFlow = latest?.exitFlow ?? 0;
      const pct = occupancyPercentage(occupancy, capacity);
      const riskScore = crowdRiskScore({ occupancy, capacity, entryFlow, exitFlow });

      results.push({
        zoneId: zone.id,
        zoneName: zone.name,
        zoneArabicName: zone.arabicName,
        type: zone.type,
        occupancy,
        capacity,
        occupancyPercentage: pct,
        densityLevel: densityLevelFromPercentage(pct),
        entryFlow,
        exitFlow,
        avgSpeed: latest?.avgSpeed ?? 0,
        riskScore,
        riskLevel: riskLevelFromScore(riskScore),
        predictedOccupancy: {
          '15': predictOccupancy({ occupancy, capacity, entryFlow, exitFlow, horizonMinutes: 15 }),
          '30': predictOccupancy({ occupancy, capacity, entryFlow, exitFlow, horizonMinutes: 30 }),
          '60': predictOccupancy({ occupancy, capacity, entryFlow, exitFlow, horizonMinutes: 60 }),
        },
        recordedAt: latest?.recordedAt ?? null,
      });
    }
    return results;
  }

  async history(user: AuthenticatedUser, zoneId: string, limit = 60) {
    // ensure the zone belongs to the tenant
    const zone = await this.prisma.zone.findFirst({ where: tenantWhere(user, { id: zoneId }) });
    if (!zone) return [];
    const readings = await this.prisma.crowdReading.findMany({
      where: { zoneId },
      orderBy: { recordedAt: 'desc' },
      take: Math.min(limit, 500),
    });
    return readings.reverse();
  }
}
