import { BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { HttpExceptionFilter } from '../http-exception.filter';

function run(ex: unknown) {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }), getRequest: () => ({ method: 'GET', url: '/x' }) }),
  };
  new HttpExceptionFilter().catch(ex, host as never);
  return { code: (status.mock.calls[0] as unknown[])[0], body: (json.mock.calls[0] as unknown[])[0] as Record<string, unknown> };
}

describe('HttpExceptionFilter', () => {
  it('keeps messageAr and normalises shape', () => {
    const r = run(new BadRequestException({ message: 'Overlap', messageAr: 'يوجد تداخل' }));
    expect(r.code).toBe(400);
    expect(r.body).toEqual({ statusCode: 400, message: 'Overlap', messageAr: 'يوجد تداخل' });
  });
  it('joins validation arrays and adds a default Arabic message', () => {
    const r = run(new BadRequestException(['email must be an email', 'password too short']));
    expect(r.body.message).toBe('email must be an email; password too short');
    expect(r.body.errors).toHaveLength(2);
    expect(r.body.messageAr).toBe('طلب غير صالح');
  });
  it('maps unknown errors to 500', () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const r = run(new Error('boom'));
    expect(r.code).toBe(500);
    expect(run(new ForbiddenException()).body.messageAr).toBe('ليس لديك صلاحية لهذا الإجراء');
  });
});
