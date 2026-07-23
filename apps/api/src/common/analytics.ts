import { DensityLevel, RiskLevel } from '@prisma/client';

/**
 * Pure, dependency-free analytics used by crowd/queue engines.
 * Kept side-effect-free so it is trivially unit-testable.
 */

export function occupancyPercentage(occupancy: number, capacity: number): number {
  if (capacity <= 0) return 0;
  return Math.min(100, Math.round((occupancy / capacity) * 1000) / 10);
}

export function densityLevelFromPercentage(pct: number): DensityLevel {
  if (pct < 25) return 'VERY_LOW';
  if (pct < 50) return 'LOW';
  if (pct < 75) return 'MODERATE';
  if (pct < 90) return 'HIGH';
  return 'CRITICAL';
}

export function riskLevelFromScore(score: number): RiskLevel {
  if (score < 40) return 'LOW';
  if (score < 70) return 'MODERATE';
  if (score < 90) return 'HIGH';
  return 'CRITICAL';
}

/**
 * Composite crowd risk score (0..100) combining density, net inflow pressure
 * and how close occupancy is to capacity.
 */
export function crowdRiskScore(params: {
  occupancy: number;
  capacity: number;
  entryFlow: number;
  exitFlow: number;
}): number {
  const { occupancy, capacity, entryFlow, exitFlow } = params;
  const pct = occupancyPercentage(occupancy, capacity);
  const netFlow = entryFlow - exitFlow;
  // headroom in minutes before capacity at current net inflow
  const headroom = netFlow > 0 ? (capacity - occupancy) / netFlow : Infinity;
  const flowPressure = headroom === Infinity ? 0 : Math.max(0, 100 - headroom * 5);
  const score = pct * 0.7 + flowPressure * 0.3;
  return Math.min(100, Math.round(score * 10) / 10);
}

/**
 * Predicts occupancy at a future horizon (minutes) using current net flow,
 * clamped to [0, capacity]. Simple linear projection — the MVP baseline the
 * spec calls for before Prophet/XGBoost are introduced.
 */
export function predictOccupancy(params: {
  occupancy: number;
  capacity: number;
  entryFlow: number;
  exitFlow: number;
  horizonMinutes: number;
}): number {
  const { occupancy, capacity, entryFlow, exitFlow, horizonMinutes } = params;
  const projected = occupancy + (entryFlow - exitFlow) * horizonMinutes;
  return Math.max(0, Math.min(capacity, Math.round(projected)));
}

export interface QueueMetrics {
  queueLength: number;
  waitingTime: number; // minutes
  utilization: number; // 0..1
  riskScore: number; // 0..100
  recommendations: string[];
}

/**
 * Queueing-theory based metrics. Uses an M/M/1-style approximation:
 * waiting time = queue length / service rate; utilization = arrival/service.
 */
export function queueMetrics(params: {
  queueLength: number;
  arrivalRate: number; // per minute
  serviceRate: number; // per minute
  abandonmentRate?: number;
}): QueueMetrics {
  const { queueLength, arrivalRate, serviceRate } = params;
  const safeService = serviceRate > 0 ? serviceRate : 0.0001;
  const utilization = Math.min(4, arrivalRate / safeService);
  const waitingTime = Math.round((queueLength / safeService) * 10) / 10;

  // risk grows with wait time and with over-saturation (utilization > 1)
  const waitComponent = Math.min(60, waitingTime) / 60; // normalize to ~1h
  const satComponent = Math.max(0, utilization - 1) / 3;
  const riskScore = Math.min(
    100,
    Math.round((waitComponent * 60 + satComponent * 40) * 10) / 10,
  );

  const recommendations: string[] = [];
  if (utilization > 1.5) {
    recommendations.push('OPEN_ADDITIONAL_LANE');
    recommendations.push('ADD_STAFF');
  } else if (utilization > 1.1) {
    recommendations.push('ADD_STAFF');
  }
  if (waitingTime > 20) {
    recommendations.push('REDIRECT_TO_ALTERNATE_GATE');
    recommendations.push('NOTIFY_VISITORS');
  }
  if (riskScore >= 90) {
    recommendations.push('TEMPORARY_ENTRY_HOLD');
    recommendations.push('DISPATCH_FIELD_TEAM');
  }

  return {
    queueLength,
    waitingTime,
    utilization: Math.round(utilization * 100) / 100,
    riskScore,
    recommendations,
  };
}

/** Moving average used as the baseline time-series forecaster. */
export function movingAverage(series: number[], window = 5): number {
  if (series.length === 0) return 0;
  const w = Math.min(window, series.length);
  const slice = series.slice(-w);
  return Math.round((slice.reduce((a, b) => a + b, 0) / w) * 10) / 10;
}
