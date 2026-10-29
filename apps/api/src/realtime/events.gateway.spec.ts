import { EventsGateway } from './events.gateway';

const ACCESS_SECRET = 'test-access-secret';

function makeSocket(opts: { authToken?: string; header?: string } = {}) {
  return {
    id: `s-${Math.random()}`,
    handshake: {
      auth: opts.authToken ? { token: opts.authToken } : {},
      headers: opts.header ? { authorization: opts.header } : {},
    },
    connected: true,
    data: {} as Record<string, unknown>,
    join: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    sub: 'u1',
    email: 'ops@masar34.sa',
    organizationId: 'org1',
    roles: ['OPERATIONS_MANAGER'],
    isSuperAdmin: false,
    exp: Math.floor(Date.now() / 1000) + 900,
    ...overrides,
  };
}

function makeGateway(verify: jest.Mock) {
  const authService = {
    buildAuthUser: jest.fn().mockImplementation(async (p) => ({
      id: p.sub,
      email: p.email,
      organizationId: p.organizationId,
      roles: p.roles,
      permissions: [],
      isSuperAdmin: p.isSuperAdmin,
    })),
  };
  return new EventsGateway({ verifyAsync: verify } as never, authService as never);
}

describe('EventsGateway (realtime tenant isolation)', () => {
  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = ACCESS_SECRET;
  });
  afterEach(() => jest.useRealTimers());

  it('disconnects a socket with no token', async () => {
    const gw = makeGateway(jest.fn());
    const socket = makeSocket();
    await gw.handleConnection(socket as never);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('disconnects a socket with an invalid token', async () => {
    const gw = makeGateway(jest.fn().mockRejectedValue(new Error('bad signature')));
    const socket = makeSocket({ authToken: 'forged' });
    await gw.handleConnection(socket as never);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('verifies with the access secret and joins only the user own org room', async () => {
    const verify = jest.fn().mockResolvedValue(payload());
    const gw = makeGateway(verify);
    const socket = makeSocket({ authToken: 'good' });
    await gw.handleConnection(socket as never);
    expect(verify).toHaveBeenCalledWith('good', { secret: ACCESS_SECRET });
    expect(socket.join).toHaveBeenCalledWith('org:org1');
    expect(socket.disconnect).not.toHaveBeenCalled();
    gw.handleDisconnect(socket as never);
  });

  it('accepts a bearer Authorization header', async () => {
    const verify = jest.fn().mockResolvedValue(payload());
    const gw = makeGateway(verify);
    const socket = makeSocket({ header: 'Bearer good' });
    await gw.handleConnection(socket as never);
    expect(verify).toHaveBeenCalledWith('good', { secret: ACCESS_SECRET });
    gw.handleDisconnect(socket as never);
  });

  it('refuses a join to another organization', async () => {
    const gw = makeGateway(jest.fn().mockResolvedValue(payload()));
    const socket = makeSocket({ authToken: 'good' });
    await gw.handleConnection(socket as never);
    socket.join.mockClear();
    expect(gw.handleJoin({ organizationId: 'org2' }, socket as never)).toEqual({
      joined: null,
      error: 'forbidden',
    });
    expect(socket.join).not.toHaveBeenCalled();
    gw.handleDisconnect(socket as never);
  });

  it('refuses a join from a socket that never authenticated', () => {
    const gw = makeGateway(jest.fn());
    const socket = makeSocket();
    expect(gw.handleJoin({ organizationId: 'org1' }, socket as never).joined).toBeNull();
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('lets a super admin join any organization', async () => {
    const gw = makeGateway(
      jest.fn().mockResolvedValue(payload({ isSuperAdmin: true, organizationId: null })),
    );
    const socket = makeSocket({ authToken: 'good' });
    await gw.handleConnection(socket as never);
    expect(gw.handleJoin({ organizationId: 'org2' }, socket as never)).toEqual({ joined: 'org2' });
    expect(socket.join).toHaveBeenCalledWith('org:org2');
    gw.handleDisconnect(socket as never);
  });

  it('disconnects the socket when its token expires', async () => {
    jest.useFakeTimers();
    const exp = Math.floor(Date.now() / 1000) + 60;
    const gw = makeGateway(jest.fn().mockResolvedValue(payload({ exp })));
    const socket = makeSocket({ authToken: 'good' });
    await gw.handleConnection(socket as never);
    expect(socket.disconnect).not.toHaveBeenCalled();
    jest.advanceTimersByTime(61_000);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('does not join or arm a timer for a client that dropped during verification', async () => {
    const gw = makeGateway(jest.fn().mockResolvedValue(payload()));
    const socket = makeSocket({ authToken: 'good' });
    socket.connected = false;
    await gw.handleConnection(socket as never);
    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.data.user).toBeUndefined();
  });

  it('caps the expiry timer so a very long-lived token does not fire immediately', async () => {
    jest.useFakeTimers();
    const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
    const gw = makeGateway(jest.fn().mockResolvedValue(payload({ exp })));
    const socket = makeSocket({ authToken: 'good' });
    await gw.handleConnection(socket as never);
    jest.advanceTimersByTime(1000);
    expect(socket.disconnect).not.toHaveBeenCalled();
    gw.handleDisconnect(socket as never);
  });

  it('emits only to the target organization room', () => {
    const gw = makeGateway(jest.fn());
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    gw.server = { to } as never;
    gw.emitToOrg('org1', 'alert:new', { id: 'a1' });
    expect(to).toHaveBeenCalledWith('org:org1');
    expect(emit).toHaveBeenCalledWith('alert:new', { id: 'a1' });
  });
});
