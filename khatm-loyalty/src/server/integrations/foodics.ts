import type { PosAdapter } from "./pos";

/**
 * Foodics order webhook → PosOrder.
 *
 * NOTE: the field mapping below is an assumption based on Foodics' public order
 * model (order.id, order.status, order.customer.phone / dial_code, order.branch.id)
 * and must be verified against the Foodics developer docs and a real sandbox
 * payload before going live. It is isolated here so only this file changes.
 * Foodics order status 4 = "closed" (assumed).
 */
type FoodicsWebhook = {
  event?: string;
  order?: {
    id?: string;
    status?: number;
    customer?: { phone?: string; dial_code?: number | string } | null;
    branch?: { id?: string } | null;
  };
};

export const foodicsAdapter: PosAdapter = {
  provider: "foodics",
  parse(body) {
    const b = body as FoodicsWebhook;
    const o = b?.order;
    if (!o?.id) return null;
    const c = o.customer;
    let phone: string | null = null;
    if (c?.phone) phone = c.dial_code ? `+${String(c.dial_code).replace(/^\+/, "")}${c.phone.replace(/^0/, "")}` : c.phone;
    return { externalId: String(o.id), phone, externalBranchId: o.branch?.id ?? null, completed: o.status === 4 };
  },
};
