'use client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  arabicName?: string;
  organizationId: string | null;
  roles: string[];
  permissions: string[];
}

const TOKEN_KEY = 'masar_access_token';
const USER_KEY = 'masar_user';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as AuthUser) : null;
}

export function setSession(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = body.message || msg;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, Array.isArray(msg) ? msg.join(', ') : msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ accessToken: string; refreshToken: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  overview: () => request<DashboardOverview>('/dashboard/overview'),
  crowdCurrent: () => request<CrowdZone[]>('/crowd/current'),
  queuesCurrent: () => request<QueueGate[]>('/queues/current'),
  alerts: () => request<Alert[]>('/alerts'),
  acknowledgeAlert: (id: string) => request(`/alerts/${id}/acknowledge`, { method: 'POST' }),
  resolveAlert: (id: string) => request(`/alerts/${id}/resolve`, { method: 'POST' }),
  scenarios: () => request<{ key: string; name: string; arabicName: string }[]>('/simulations/scenarios'),
  simStatus: () => request<SimStatus>('/simulations/status'),
  startSim: (scenario: string) =>
    request('/simulations/start', { method: 'POST', body: JSON.stringify({ scenario }) }),
  stopSim: () => request('/simulations/stop', { method: 'POST' }),
};

export interface DashboardOverview {
  kpis: {
    activeEvents: number;
    totalVisitors: number;
    currentOccupancy: number;
    occupancyPercentage: number;
    averageQueueTime: number;
    maxQueueTime: number;
    activeAlerts: number;
    openIncidents: number;
    highRiskZones: number;
    gateThroughput: number;
    predictedCongestion: string;
  };
  highRiskZones: { zoneId: string; zoneName: string; riskLevel: string; occupancyPercentage: number }[];
}

export interface CrowdZone {
  zoneId: string;
  zoneName: string;
  zoneArabicName?: string;
  type: string;
  occupancy: number;
  capacity: number;
  occupancyPercentage: number;
  densityLevel: string;
  entryFlow: number;
  exitFlow: number;
  riskScore: number;
  riskLevel: string;
  predictedOccupancy: { '15': number; '30': number; '60': number };
}

export interface QueueGate {
  gateId: string;
  gateName: string;
  gateCode: string;
  gateStatus: string;
  queueLength: number;
  waitingTime: number;
  utilization: number;
  riskScore: number;
  recommendations: string[];
}

export interface Alert {
  id: string;
  type: string;
  severity: string;
  message: string;
  recommendedAction?: string;
  status: string;
  createdAt: string;
}

export interface SimStatus {
  active: { simulationId: string; scenario: string; tick: number } | null;
  recent: { id: string; scenario: string; status: string; createdAt: string }[];
}
