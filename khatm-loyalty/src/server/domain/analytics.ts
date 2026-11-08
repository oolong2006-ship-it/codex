import { one, q } from "../db";
import { requirePermission, type Actor } from "../actor";
import { PERMISSIONS } from "../rbac";

const VISIT = `source IN ('STAFF','POS')`;

export type Kpis = {
  customers: number;
  active30: number;
  visits30: number;
  repeatRate: number | null;
  redemptions30: number;
  rewardsReady: number;
};

export async function kpis(actor: Actor): Promise<Kpis> {
  requirePermission(actor, PERMISSIONS.DASHBOARD_VIEW);
  const m = actor.merchantId;
  const r = await one<Kpis & { repeat_num: number; repeat_den: number }>(
    `SELECT
       (SELECT count(*)::int FROM customers WHERE merchant_id = $1) AS customers,
       (SELECT count(DISTINCT card_id)::int FROM stamp_events WHERE merchant_id = $1 AND ${VISIT} AND created_at > now() - interval '30 days') AS "active30",
       (SELECT count(*)::int FROM stamp_events WHERE merchant_id = $1 AND ${VISIT} AND created_at > now() - interval '30 days') AS "visits30",
       (SELECT count(*)::int FROM redemptions WHERE merchant_id = $1 AND created_at > now() - interval '30 days') AS "redemptions30",
       (SELECT coalesce(sum(rewards_available),0)::int FROM cards WHERE merchant_id = $1 AND status = 'ACTIVE') AS "rewardsReady",
       (SELECT count(*)::int FROM (SELECT card_id FROM stamp_events WHERE merchant_id = $1 AND ${VISIT} AND created_at > now() - interval '90 days' AND card_id IS NOT NULL GROUP BY card_id HAVING count(*) >= 2) x) AS repeat_num,
       (SELECT count(DISTINCT card_id)::int FROM stamp_events WHERE merchant_id = $1 AND ${VISIT} AND created_at > now() - interval '90 days') AS repeat_den`,
    [m],
  );
  return {
    customers: r!.customers,
    active30: r!.active30,
    visits30: r!.visits30,
    redemptions30: r!.redemptions30,
    rewardsReady: r!.rewardsReady,
    repeatRate: r!.repeat_den > 0 ? r!.repeat_num / r!.repeat_den : null,
  };
}

export async function weeklyVisits(actor: Actor, weeks = 12) {
  requirePermission(actor, PERMISSIONS.DASHBOARD_VIEW);
  return q<{ week: Date; visits: number }>(
    `WITH w AS (
       SELECT generate_series(date_trunc('week', (now() AT TIME ZONE 'Asia/Riyadh')) - make_interval(weeks => $2 - 1),
                              date_trunc('week', (now() AT TIME ZONE 'Asia/Riyadh')), interval '1 week') AS week
     )
     SELECT w.week, count(e.id)::int AS visits
     FROM w LEFT JOIN stamp_events e
       ON e.merchant_id = $1 AND e.${VISIT}
      AND date_trunc('week', e.created_at AT TIME ZONE 'Asia/Riyadh') = w.week
     GROUP BY w.week ORDER BY w.week`,
    [actor.merchantId, weeks],
  );
}

export async function branchPerformance(actor: Actor) {
  requirePermission(actor, PERMISSIONS.DASHBOARD_VIEW);
  return q<{ id: string; name: string; visits: number; stamps: number; redemptions: number }>(
    `SELECT b.id, b.name,
            (SELECT count(*)::int FROM stamp_events e WHERE e.branch_id = b.id AND e.${VISIT} AND e.created_at > now() - interval '30 days') AS visits,
            (SELECT coalesce(sum(quantity),0)::int FROM stamp_events e WHERE e.branch_id = b.id AND e.created_at > now() - interval '30 days') AS stamps,
            (SELECT count(*)::int FROM redemptions r WHERE r.branch_id = b.id AND r.created_at > now() - interval '30 days') AS redemptions
     FROM branches b WHERE b.merchant_id = $1 ORDER BY visits DESC, b.name`,
    [actor.merchantId],
  );
}

export type AtRiskCustomer = {
  customerId: string;
  name: string;
  phone: string;
  visits: number;
  avgIntervalDays: number;
  daysSinceLast: number;
  marketingOptIn: boolean;
};

/**
 * Repeat customers (3+ visits) who are overdue: no visit for more than
 * max(14 days, 2× their own average interval), and not gone for over 120 days.
 */
export async function atRiskCustomers(actor: Actor, limit = 50): Promise<AtRiskCustomer[]> {
  requirePermission(actor, PERMISSIONS.CUSTOMER_VIEW);
  return q<AtRiskCustomer>(
    `WITH v AS (
       SELECT c.customer_id, count(*)::int AS visits,
              extract(epoch FROM max(e.created_at) - min(e.created_at)) / 86400.0 / nullif(count(*) - 1, 0) AS avg_interval,
              extract(epoch FROM now() - max(e.created_at)) / 86400.0 AS since_last
       FROM stamp_events e JOIN cards c ON c.id = e.card_id
       WHERE e.merchant_id = $1 AND e.${VISIT}
       GROUP BY c.customer_id
       HAVING count(*) >= 3
     )
     SELECT cu.id AS "customerId", cu.name, cu.phone, v.visits,
            round(v.avg_interval::numeric, 1)::float AS "avgIntervalDays",
            floor(v.since_last)::int AS "daysSinceLast", cu.marketing_opt_in AS "marketingOptIn"
     FROM v JOIN customers cu ON cu.id = v.customer_id
     WHERE cu.merchant_id = $1 AND v.since_last > greatest(14, 2 * v.avg_interval) AND v.since_last < 120
     ORDER BY v.since_last / greatest(v.avg_interval, 1) DESC
     LIMIT $2`,
    [actor.merchantId, limit],
  );
}
