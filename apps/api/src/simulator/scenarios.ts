/**
 * Named simulation scenarios. Each scenario tunes how the engine perturbs
 * occupancy, flows and incident probability on every tick, so the platform can
 * run end-to-end with no physical sensors (spec §16).
 */

export interface ScenarioConfig {
  key: string;
  name: string;
  arabicName: string;
  /** multiplier applied to baseline arrival/entry flow */
  inflowFactor: number;
  /** multiplier applied to service/exit flow */
  outflowFactor: number;
  /** probability [0..1] of spawning an incident on a given tick */
  incidentChance: number;
  /** probability [0..1] of taking a gate offline / degrading a device */
  disruptionChance: number;
  /** optional bias toward a specific zone type for congestion */
  focusZoneType?: string;
}

export const SCENARIOS: Record<string, ScenarioConfig> = {
  NORMAL: {
    key: 'NORMAL',
    name: 'Normal Event',
    arabicName: 'فعالية عادية',
    inflowFactor: 1,
    outflowFactor: 1,
    incidentChance: 0.02,
    disruptionChance: 0.01,
  },
  HIGH_ATTENDANCE: {
    key: 'HIGH_ATTENDANCE',
    name: 'High Attendance',
    arabicName: 'حضور مرتفع',
    inflowFactor: 1.8,
    outflowFactor: 0.9,
    incidentChance: 0.05,
    disruptionChance: 0.02,
  },
  GATE_FAILURE: {
    key: 'GATE_FAILURE',
    name: 'Gate Failure',
    arabicName: 'تعطل بوابة',
    inflowFactor: 1.2,
    outflowFactor: 0.6,
    incidentChance: 0.08,
    disruptionChance: 0.4,
  },
  CROWD_SURGE: {
    key: 'CROWD_SURGE',
    name: 'Crowd Surge',
    arabicName: 'تدفق مفاجئ',
    inflowFactor: 2.5,
    outflowFactor: 0.7,
    incidentChance: 0.12,
    disruptionChance: 0.03,
  },
  TRANSPORT_DELAY: {
    key: 'TRANSPORT_DELAY',
    name: 'Transport Delay',
    arabicName: 'تأخر النقل',
    inflowFactor: 0.6,
    outflowFactor: 0.5,
    incidentChance: 0.04,
    disruptionChance: 0.02,
    focusZoneType: 'TRANSPORTATION',
  },
  EMERGENCY_EVACUATION: {
    key: 'EMERGENCY_EVACUATION',
    name: 'Emergency Evacuation',
    arabicName: 'إخلاء طارئ',
    inflowFactor: 0.1,
    outflowFactor: 3,
    incidentChance: 0.2,
    disruptionChance: 0.05,
  },
  FOOD_ZONE_CONGESTION: {
    key: 'FOOD_ZONE_CONGESTION',
    name: 'Food Zone Congestion',
    arabicName: 'ازدحام مناطق الطعام',
    inflowFactor: 1.3,
    outflowFactor: 0.8,
    incidentChance: 0.05,
    disruptionChance: 0.02,
    focusZoneType: 'FOOD',
  },
  MULTIPLE_INCIDENTS: {
    key: 'MULTIPLE_INCIDENTS',
    name: 'Multiple Incidents',
    arabicName: 'حوادث متعددة',
    inflowFactor: 1.4,
    outflowFactor: 0.9,
    incidentChance: 0.3,
    disruptionChance: 0.1,
  },
  CAMERA_OFFLINE: {
    key: 'CAMERA_OFFLINE',
    name: 'Camera Offline',
    arabicName: 'كاميرا خارج الخدمة',
    inflowFactor: 1,
    outflowFactor: 1,
    incidentChance: 0.03,
    disruptionChance: 0.5,
  },
  STAFF_SHORTAGE: {
    key: 'STAFF_SHORTAGE',
    name: 'Staff Shortage',
    arabicName: 'نقص الموظفين',
    inflowFactor: 1.2,
    outflowFactor: 0.5,
    incidentChance: 0.07,
    disruptionChance: 0.03,
  },
};

export const SCENARIO_KEYS = Object.keys(SCENARIOS);
