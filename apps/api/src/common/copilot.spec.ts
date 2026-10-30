import {
  assessSituation,
  buildBriefingMessages,
  compactSnapshot,
  MAX_ACTIONS,
  parseBriefing,
  readCopilotConfig,
  ruleBasedBriefing,
  selectRoute,
  SituationSnapshot,
} from './copilot';

const calm: SituationSnapshot = {
  occupancyPercentage: 30,
  zones: [{ name: 'المنطقة A', riskLevel: 'LOW', occupancyPercentage: 30, predicted30Percentage: 35 }],
  gates: [{ name: 'بوابة 1', status: 'OPEN', queueLength: 10, waitingTime: 2 }],
  openIncidents: 0,
  breachedIncidents: 0,
  activeAlerts: 0,
  criticalAlerts: 0,
};

const config = readCopilotConfig({});

describe('copilot.assessSituation', () => {
  it('is CALM when everything is within limits', () => {
    expect(assessSituation(calm)).toBe('CALM');
  });

  it('is WATCH on a moderate zone or an open incident', () => {
    expect(
      assessSituation({ ...calm, zones: [{ ...calm.zones[0], riskLevel: 'MODERATE' }] }),
    ).toBe('WATCH');
    expect(assessSituation({ ...calm, openIncidents: 1 })).toBe('WATCH');
  });

  it('is ELEVATED on a high-risk zone, a breached SLA or a 20-minute queue', () => {
    expect(assessSituation({ ...calm, zones: [{ ...calm.zones[0], riskLevel: 'HIGH' }] })).toBe(
      'ELEVATED',
    );
    expect(assessSituation({ ...calm, breachedIncidents: 1 })).toBe('ELEVATED');
    expect(assessSituation({ ...calm, gates: [{ ...calm.gates[0], waitingTime: 20 }] })).toBe(
      'ELEVATED',
    );
  });

  it('is CRITICAL on a critical zone, a critical alert, or high risk plus a breached SLA', () => {
    expect(
      assessSituation({ ...calm, zones: [{ ...calm.zones[0], riskLevel: 'CRITICAL' }] }),
    ).toBe('CRITICAL');
    expect(assessSituation({ ...calm, criticalAlerts: 1 })).toBe('CRITICAL');
    expect(
      assessSituation({
        ...calm,
        breachedIncidents: 1,
        zones: [{ ...calm.zones[0], riskLevel: 'HIGH' }],
      }),
    ).toBe('CRITICAL');
  });
});

describe('copilot.selectRoute', () => {
  it('sends routine situations to the routine combo with the relaxed timeout', () => {
    expect(selectRoute('CALM', config)).toEqual({
      tier: 'routine',
      model: 'masar-routine',
      timeoutMs: 15000,
    });
    expect(selectRoute('WATCH', config).tier).toBe('routine');
  });

  it('sends urgent situations to the priority combo with the short timeout', () => {
    expect(selectRoute('ELEVATED', config)).toEqual({
      tier: 'priority',
      model: 'masar-priority',
      timeoutMs: 6000,
    });
    expect(selectRoute('CRITICAL', config).tier).toBe('priority');
  });
});

describe('copilot.readCopilotConfig', () => {
  it('is disabled without a base URL and strips trailing slashes when set', () => {
    expect(config.baseUrl).toBeNull();
    const c = readCopilotConfig({
      OMNIROUTE_BASE_URL: 'http://localhost:20128/v1/',
      OMNIROUTE_MODEL_PRIORITY: 'fast-combo',
      OMNIROUTE_TIMEOUT_PRIORITY_MS: 'nonsense',
    });
    expect(c.baseUrl).toBe('http://localhost:20128/v1');
    expect(c.priorityModel).toBe('fast-combo');
    expect(c.priorityTimeoutMs).toBe(6000);
  });
});

describe('copilot.parseBriefing', () => {
  it('accepts a fenced JSON reply, normalises priorities and sorts HIGH first', () => {
    const reply =
      '```json\n{"summary":"ازدحام في الشمال","actions":[' +
      '{"priority":"low","target":"A","action":"راقب"},' +
      '{"priority":"HIGH","target":"B","action":"أغلق الدخول"},' +
      '{"priority":"weird","target":"C","action":"وجّه الزوار"}]}\n```';
    const b = parseBriefing(reply);
    expect(b?.summary).toBe('ازدحام في الشمال');
    expect(b?.actions.map((a) => a.priority)).toEqual(['HIGH', 'MEDIUM', 'LOW']);
  });

  it('rejects non-JSON, empty summaries and drops actions without text', () => {
    expect(parseBriefing('لا أعرف')).toBeNull();
    expect(parseBriefing('{"summary":"","actions":[]}')).toBeNull();
    expect(parseBriefing(null)).toBeNull();
    expect(parseBriefing('{"summary":"ok","actions":[{"priority":"HIGH"}]}')?.actions).toEqual([]);
  });

  it(`caps the reply at ${MAX_ACTIONS} actions`, () => {
    const actions = Array.from({ length: 9 }, (_, i) => ({ priority: 'LOW', action: `a${i}` }));
    expect(parseBriefing(JSON.stringify({ summary: 's', actions }))?.actions).toHaveLength(
      MAX_ACTIONS,
    );
  });
});

describe('copilot.ruleBasedBriefing', () => {
  it('recommends routine monitoring when calm', () => {
    const b = ruleBasedBriefing(calm, 'CALM');
    expect(b.actions).toHaveLength(1);
    expect(b.actions[0].priority).toBe('LOW');
  });

  it('targets critical zones, long queues and breached incidents with HIGH actions', () => {
    const snapshot: SituationSnapshot = {
      ...calm,
      breachedIncidents: 2,
      zones: [
        { name: 'المدرج الشمالي', riskLevel: 'CRITICAL', occupancyPercentage: 97, predicted30Percentage: 100 },
        { name: 'الساحة', riskLevel: 'LOW', occupancyPercentage: 70, predicted30Percentage: 92 },
      ],
      gates: [{ name: 'بوابة 3', status: 'OPEN', queueLength: 400, waitingTime: 25 }],
    };
    const b = ruleBasedBriefing(snapshot, assessSituation(snapshot));
    expect(b.actions.map((a) => a.target)).toEqual(['المدرج الشمالي', 'الحوادث', 'بوابة 3', 'الساحة']);
    expect(b.actions.slice(0, 3).every((a) => a.priority === 'HIGH')).toBe(true);
  });
});

describe('copilot.buildBriefingMessages', () => {
  it('sends only the riskiest zones and longest queues, never more than the caps', () => {
    const zones = Array.from({ length: 12 }, (_, i) => ({
      name: `z${i}`,
      riskLevel: i === 11 ? 'CRITICAL' : 'LOW',
      occupancyPercentage: i,
      predicted30Percentage: i,
    }));
    const compact = compactSnapshot({ ...calm, zones });
    expect(compact.zones).toHaveLength(8);
    expect(compact.zones[0].name).toBe('z11');

    const [system, user] = buildBriefingMessages({ ...calm, zones }, 'CRITICAL');
    expect(system.role).toBe('system');
    expect(user.content).toContain('CRITICAL');
    expect(user.content).not.toContain('"z0"');
  });
});
