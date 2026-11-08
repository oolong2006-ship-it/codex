import { one, type Db, pool } from "../db";
import { parseDesign, stampRow, type CardDesign } from "../domain/design";
import { signCardToken } from "../tokens";
import { env } from "../env";

/** Everything a wallet pass / web card needs, assembled from one query. */
export type PassView = {
  cardId: string;
  serial: string;
  authToken: string;
  barcode: string;
  status: "ACTIVE" | "VOID";
  merchantId: string;
  merchantName: string;
  merchantSlug: string;
  programId: string;
  programName: string;
  rewardDescription: string;
  terms: string | null;
  stampsRequired: number;
  currentStamps: number;
  rewardsAvailable: number;
  customerName: string;
  design: CardDesign;
  stampRow: string;
  updatedAt: Date;
  webCardUrl: string;
};

type Row = {
  id: string;
  serial_number: string;
  auth_token: string;
  status: "ACTIVE" | "VOID";
  current_stamps: number;
  rewards_available: number;
  updated_at: Date;
  merchant_id: string;
  merchant_name: string;
  merchant_slug: string;
  program_id: string;
  program_name: string;
  reward_description: string;
  terms: string | null;
  stamps_required: number;
  design: unknown;
  customer_name: string;
};

const SQL = `
  SELECT c.id, c.serial_number, c.auth_token, c.status, c.current_stamps, c.rewards_available,
         greatest(c.updated_at, p.updated_at) AS updated_at,
         m.id AS merchant_id, m.name AS merchant_name, m.slug AS merchant_slug,
         p.id AS program_id, p.name AS program_name, p.reward_description, p.terms, p.stamps_required, p.design,
         cu.name AS customer_name
  FROM cards c
  JOIN loyalty_programs p ON p.id = c.program_id
  JOIN merchants m ON m.id = c.merchant_id
  JOIN customers cu ON cu.id = c.customer_id`;

function toView(r: Row): PassView {
  const design = parseDesign(r.design);
  return {
    cardId: r.id,
    serial: r.serial_number,
    authToken: r.auth_token,
    barcode: signCardToken(r.serial_number),
    status: r.status,
    merchantId: r.merchant_id,
    merchantName: r.merchant_name,
    merchantSlug: r.merchant_slug,
    programId: r.program_id,
    programName: r.program_name,
    rewardDescription: r.reward_description,
    terms: r.terms,
    stampsRequired: r.stamps_required,
    currentStamps: r.current_stamps,
    rewardsAvailable: r.rewards_available,
    customerName: r.customer_name,
    design,
    stampRow: stampRow(design.icon, r.current_stamps, r.stamps_required),
    updatedAt: new Date(r.updated_at),
    webCardUrl: `${env().APP_URL}/c/${r.serial_number}?k=${encodeURIComponent(r.auth_token)}`,
  };
}

export async function passViewBySerial(serial: string, db: Db = pool()): Promise<PassView | null> {
  const r = await one<Row>(`${SQL} WHERE c.serial_number = $1`, [serial], db);
  return r ? toView(r) : null;
}

export async function passViewById(cardId: string, db: Db = pool()): Promise<PassView | null> {
  const r = await one<Row>(`${SQL} WHERE c.id = $1`, [cardId], db);
  return r ? toView(r) : null;
}
