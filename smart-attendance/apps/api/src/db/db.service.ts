import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, types } from 'pg';

import { APP_CONFIG, AppConfig } from '../config';

// تاريخ تشغيلي (date) يبقى نصًا YYYY-MM-DD، لا منتصف ليل بمنطقة الخادم.
types.setTypeParser(1082, (value) => value);

export type Tx = PoolClient;

/**
 * طبقة الوصول لقاعدة البيانات.
 * - appPool يتصل بدور sa_app الخاضع لـ RLS؛ كل معاملة تضبط app.tenant_id.
 * - platformPool يتصل بدور sa_platform (BYPASSRLS) ولا يستخدمه إلا مسار Super Admin
 *   والدخول قبل معرفة العميل لحسابات المنصة.
 */
@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly appPool: Pool;
  private readonly platformPool: Pool;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.appPool = new Pool({ connectionString: config.databaseAppUrl, max: 20 });
    this.platformPool = new Pool({ connectionString: config.databasePlatformUrl, max: 5 });
  }

  /** معاملة في سياق عميل واحد. RLS يحصر كل استعلام فيها بهذا العميل. */
  async tenantTx<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.run(this.appPool, fn, tenantId);
  }

  /** معاملة دون سياق عميل (RLS يُرجع صفر صفوف تشغيلية). للدوال SECURITY DEFINER فقط. */
  async anonTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.run(this.appPool, fn, null);
  }

  /** معاملة بصلاحيات المنصة. */
  async platformTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.run(this.platformPool, fn, null);
  }

  private async run<T>(pool: Pool, fn: (tx: Tx) => Promise<T>, tenantId: string | null): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (tenantId) await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.appPool.end(), this.platformPool.end()]);
  }
}
