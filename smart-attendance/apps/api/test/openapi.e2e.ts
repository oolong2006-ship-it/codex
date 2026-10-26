import { INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { buildOpenApi } from '../src/app.factory';
import { AuthController } from '../src/auth/auth.controller';
import { DevicesController } from '../src/devices/devices.controller';
import { OrgController } from '../src/org/org.controller';
import { PlatformController } from '../src/platform/platform.controller';
import { bootApp } from './helpers';

/** كل مسار مسجل في الكود يظهر في OpenAPI 3.1 المولّد آليًا. */
describe('OpenAPI', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await bootApp();
  });
  afterAll(() => app.close());

  function routes(controller: new (...args: never[]) => unknown): string[] {
    const base = String(Reflect.getMetadata(PATH_METADATA, controller) ?? '');
    const proto = controller.prototype as Record<string, unknown>;
    return Object.getOwnPropertyNames(proto)
      .filter((name) => name !== 'constructor' && Reflect.hasMetadata(PATH_METADATA, proto[name] as object))
      .map((name) => {
        const handler = proto[name] as object;
        const path = String(Reflect.getMetadata(PATH_METADATA, handler));
        const method = String(RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number]).toLowerCase();
        const full = `/${[base, path].filter((p) => p && p !== '/').join('/')}`.replace(/\/+/g, '/').replace(/:(\w+)/g, '{$1}');
        return `${method} ${full}`;
      });
  }

  it('is version 3.1 and documents every controller route', () => {
    const doc = buildOpenApi(app);
    expect(doc.openapi).toBe('3.1.0');
    const documented = new Set(
      Object.entries(doc.paths).flatMap(([path, item]) => Object.keys(item as object).map((m) => `${m} ${path}`)),
    );
    const expected = [AuthController, DevicesController, OrgController, PlatformController].flatMap(routes);
    expect(expected.length).toBeGreaterThanOrEqual(20);
    for (const r of expected) expect(documented).toContain(r);
  });
});
