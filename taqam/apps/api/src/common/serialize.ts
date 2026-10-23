import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { map, Observable } from 'rxjs';

/** Keys whose values are calendar days (stored as @db.Date) and must be returned as YYYY-MM-DD. */
export const DAY_KEYS = new Set([
  'date',
  'startDate',
  'endDate',
  'birthDate',
  'idExpiry',
  'passportExpiry',
  'hireDate',
  'contractEndDate',
  'probationEndDate',
  'terminationDate',
  'issueDate',
  'expiryDate',
  'weekStart',
]);

export function serialize(value: unknown, key?: string): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return key && DAY_KEYS.has(key) ? value.toISOString().slice(0, 10) : value.toISOString();
  }
  if (Prisma.Decimal.isDecimal(value)) return Number((value as Prisma.Decimal).toString());
  if (Array.isArray(value)) return value.map((v) => serialize(v, key));
  if (typeof value === 'object') {
    if (Buffer.isBuffer(value) || value instanceof StreamableFile) return value;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'passwordHash') continue;
      out[k] = serialize(v, k);
    }
    return out;
  }
  return value;
}

/** Converts Prisma Decimals to numbers and Dates to ISO / YYYY-MM-DD strings in every response. */
@Injectable()
export class SerializeInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => (typeof data === 'string' ? data : serialize(data))));
  }
}
