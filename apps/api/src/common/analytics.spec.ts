import {
  occupancyPercentage,
  densityLevelFromPercentage,
  riskLevelFromScore,
  crowdRiskScore,
  predictOccupancy,
  queueMetrics,
  movingAverage,
} from './analytics';

describe('analytics.occupancyPercentage', () => {
  it('returns 0 for non-positive capacity', () => {
    expect(occupancyPercentage(10, 0)).toBe(0);
  });
  it('computes and caps at 100', () => {
    expect(occupancyPercentage(50, 100)).toBe(50);
    expect(occupancyPercentage(150, 100)).toBe(100);
  });
});

describe('analytics.densityLevelFromPercentage', () => {
  it('maps thresholds to levels', () => {
    expect(densityLevelFromPercentage(10)).toBe('VERY_LOW');
    expect(densityLevelFromPercentage(30)).toBe('LOW');
    expect(densityLevelFromPercentage(60)).toBe('MODERATE');
    expect(densityLevelFromPercentage(80)).toBe('HIGH');
    expect(densityLevelFromPercentage(95)).toBe('CRITICAL');
  });
});

describe('analytics.riskLevelFromScore', () => {
  it('maps scores to risk bands', () => {
    expect(riskLevelFromScore(10)).toBe('LOW');
    expect(riskLevelFromScore(50)).toBe('MODERATE');
    expect(riskLevelFromScore(80)).toBe('HIGH');
    expect(riskLevelFromScore(95)).toBe('CRITICAL');
  });
});

describe('analytics.crowdRiskScore', () => {
  it('is low for empty zones with outflow', () => {
    const score = crowdRiskScore({ occupancy: 10, capacity: 1000, entryFlow: 0, exitFlow: 20 });
    expect(score).toBeLessThan(20);
  });
  it('is high for near-capacity zones with strong inflow', () => {
    const score = crowdRiskScore({ occupancy: 950, capacity: 1000, entryFlow: 100, exitFlow: 0 });
    expect(score).toBeGreaterThan(80);
  });
});

describe('analytics.predictOccupancy', () => {
  it('projects forward and clamps to capacity', () => {
    expect(
      predictOccupancy({ occupancy: 100, capacity: 1000, entryFlow: 50, exitFlow: 10, horizonMinutes: 15 }),
    ).toBe(700);
    expect(
      predictOccupancy({ occupancy: 900, capacity: 1000, entryFlow: 100, exitFlow: 0, horizonMinutes: 30 }),
    ).toBe(1000);
  });
  it('never returns negative', () => {
    expect(
      predictOccupancy({ occupancy: 50, capacity: 1000, entryFlow: 0, exitFlow: 100, horizonMinutes: 30 }),
    ).toBe(0);
  });
});

describe('analytics.queueMetrics', () => {
  it('computes waiting time from length and service rate', () => {
    const m = queueMetrics({ queueLength: 60, arrivalRate: 10, serviceRate: 20 });
    expect(m.waitingTime).toBe(3);
    expect(m.utilization).toBe(0.5);
    expect(m.recommendations).toHaveLength(0);
  });
  it('recommends actions when oversaturated', () => {
    const m = queueMetrics({ queueLength: 600, arrivalRate: 60, serviceRate: 20 });
    expect(m.utilization).toBeGreaterThan(1.5);
    expect(m.recommendations).toContain('OPEN_ADDITIONAL_LANE');
    expect(m.recommendations).toContain('ADD_STAFF');
  });
  it('handles zero service rate without dividing by zero', () => {
    const m = queueMetrics({ queueLength: 10, arrivalRate: 5, serviceRate: 0 });
    expect(Number.isFinite(m.waitingTime)).toBe(true);
  });
});

describe('analytics.movingAverage', () => {
  it('averages the trailing window', () => {
    expect(movingAverage([10, 20, 30, 40, 50], 5)).toBe(30);
    expect(movingAverage([10, 20, 30, 40, 50], 2)).toBe(45);
  });
  it('returns 0 for empty series', () => {
    expect(movingAverage([])).toBe(0);
  });
});
