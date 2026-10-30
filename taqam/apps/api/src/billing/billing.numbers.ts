import { Prisma } from '@prisma/client';

export type DocumentSeries = 'SH' | 'SHC';

/**
 * Next document number of a series ('SH' invoices, 'SHC' credit notes) for a year — call inside the issuing
 * transaction. The InvoiceCounter row is bumped atomically (INSERT … ON CONFLICT DO UPDATE … RETURNING) and stays
 * row-locked until commit, so concurrent issues serialise and a number is never handed out twice, even if an
 * invoice row later disappears. A missing counter row starts after the highest number present for that series/year.
 */
export async function nextDocumentNumber(db: Prisma.TransactionClient, series: DocumentSeries, year: number): Promise<string> {
  const prefix = `${series}-${year}-`;
  const rows = await db.$queryRaw<{ last: number }[]>(Prisma.sql`
    INSERT INTO "InvoiceCounter" ("series", "year", "last")
    VALUES (${series}, ${year}, (
      SELECT COALESCE(MAX(CAST(substring("number" FROM '^[A-Z]+-[0-9]{4}-([0-9]+)$') AS INTEGER)), 0) + 1
      FROM "Invoice" WHERE "number" LIKE ${`${prefix}%`}
    ))
    ON CONFLICT ("series", "year") DO UPDATE SET "last" = "InvoiceCounter"."last" + 1
    RETURNING "last"`);
  return `${prefix}${String(Number(rows[0].last)).padStart(4, '0')}`;
}
