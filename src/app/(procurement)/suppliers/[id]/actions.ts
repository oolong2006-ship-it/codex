"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireProcurement, requirePermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/rbac";
import { logActivity, notify } from "@/lib/activity";
import type { SupplierStatus, NotificationType } from "@prisma/client";

async function loadSupplier(id: string, organizationId: string) {
  const s = await prisma.supplier.findFirst({ where: { id, organizationId } });
  if (!s) throw new Error("Supplier not found");
  return s;
}

const STATUS_ACTIONS: Record<string, { status: SupplierStatus; permission: string; action: string; notify?: NotificationType }> = {
  approve: { status: "APPROVED", permission: PERMISSIONS.APPROVE_SUPPLIERS, action: "SUPPLIER_APPROVED", notify: "APPLICATION_APPROVED" },
  prequalify: { status: "PREQUALIFIED", permission: PERMISSIONS.APPROVE_SUPPLIERS, action: "SUPPLIER_PREQUALIFIED" },
  conditional: { status: "CONDITIONAL", permission: PERMISSIONS.APPROVE_SUPPLIERS, action: "SUPPLIER_CONDITIONAL", notify: "APPLICATION_APPROVED" },
  review: { status: "UNDER_REVIEW", permission: PERMISSIONS.APPROVE_SUPPLIERS, action: "SUPPLIER_UNDER_REVIEW" },
  reject: { status: "REJECTED", permission: PERMISSIONS.REJECT_SUPPLIERS, action: "SUPPLIER_REJECTED", notify: "APPLICATION_REJECTED" },
  suspend: { status: "SUSPENDED", permission: PERMISSIONS.SUSPEND_SUPPLIERS, action: "SUPPLIER_SUSPENDED" },
  blacklist: { status: "BLACKLISTED", permission: PERMISSIONS.SUSPEND_SUPPLIERS, action: "SUPPLIER_BLACKLISTED" },
};

export async function changeStatusAction(supplierId: string, key: string, reason?: string) {
  const cfg = STATUS_ACTIONS[key];
  if (!cfg) return { ok: false, error: "Unknown action" };
  const user = await requirePermission(cfg.permission as never);
  const supplier = await loadSupplier(supplierId, user.organizationId);
  if (supplier.status === cfg.status) return { ok: true };

  await prisma.$transaction([
    prisma.supplier.update({ where: { id: supplierId }, data: { status: cfg.status } }),
    prisma.supplierStatusHistory.create({
      data: { supplierId, fromStatus: supplier.status, toStatus: cfg.status, reason: reason || null, changedById: user.id },
    }),
  ]);
  await logActivity({ organizationId: user.organizationId, actorId: user.id, supplierId, action: cfg.action, detail: reason || null });

  if (cfg.notify && supplier.ownerUserId) {
    await notify({
      organizationId: user.organizationId,
      userId: supplier.ownerUserId,
      type: cfg.notify,
      title: `Your application is now ${cfg.status.toLowerCase().replace(/_/g, " ")}`,
      body: reason,
    });
  }
  revalidatePath(`/suppliers/${supplierId}`);
  return { ok: true };
}

export async function requestInfoAction(supplierId: string, documentCodes: string[], message: string) {
  const user = await requirePermission(PERMISSIONS.REQUEST_INFO as never);
  const supplier = await loadSupplier(supplierId, user.organizationId);
  const detail = `Requested: ${documentCodes.join(", ")}${message ? ` — ${message}` : ""}`;
  await logActivity({ organizationId: user.organizationId, actorId: user.id, supplierId, action: "REQUEST_FOR_INFORMATION", detail });
  if (supplier.ownerUserId) {
    await notify({
      organizationId: user.organizationId,
      userId: supplier.ownerUserId,
      type: "REQUEST_FOR_INFORMATION",
      title: "Additional information requested",
      body: detail,
    });
  }
  revalidatePath(`/suppliers/${supplierId}`);
  return { ok: true };
}

export async function addNoteAction(supplierId: string, body: string) {
  const user = await requirePermission(PERMISSIONS.ADD_NOTES as never);
  await loadSupplier(supplierId, user.organizationId);
  if (!body.trim()) return { ok: false, error: "Note is empty" };
  await prisma.supplierNote.create({ data: { supplierId, authorId: user.id, body: body.trim() } });
  await logActivity({ organizationId: user.organizationId, actorId: user.id, supplierId, action: "NOTE_ADDED" });
  revalidatePath(`/suppliers/${supplierId}`);
  return { ok: true };
}

export async function addEvaluationAction(supplierId: string, score: number, outcome: string, comment: string) {
  const user = await requirePermission(PERMISSIONS.EVALUATE_SUPPLIERS as never);
  await loadSupplier(supplierId, user.organizationId);
  await prisma.supplierEvaluation.create({
    data: { supplierId, authorId: user.id, score: Math.max(1, Math.min(5, score)), outcome: outcome as never, comment: comment || null },
  });
  // Recompute average rating.
  const agg = await prisma.supplierEvaluation.aggregate({ where: { supplierId }, _avg: { score: true } });
  await prisma.supplier.update({ where: { id: supplierId }, data: { rating: agg._avg.score } });
  await logActivity({ organizationId: user.organizationId, actorId: user.id, supplierId, action: "EVALUATION_ADDED", detail: `Score ${score}/5` });
  revalidatePath(`/suppliers/${supplierId}`);
  return { ok: true };
}

export async function addToShortlistAction(supplierId: string, shortlistId: string, newName?: string) {
  const user = await requirePermission(PERMISSIONS.MANAGE_SHORTLISTS as never);
  await loadSupplier(supplierId, user.organizationId);

  let listId = shortlistId;
  if (shortlistId === "__new__" && newName?.trim()) {
    const created = await prisma.shortlist.create({
      data: { organizationId: user.organizationId, ownerId: user.id, name: newName.trim() },
    });
    listId = created.id;
  }
  const list = await prisma.shortlist.findFirst({ where: { id: listId, organizationId: user.organizationId } });
  if (!list) return { ok: false, error: "Shortlist not found" };

  await prisma.shortlistSupplier.upsert({
    where: { shortlistId_supplierId: { shortlistId: listId, supplierId } },
    update: {},
    create: { shortlistId: listId, supplierId },
  });
  revalidatePath(`/suppliers/${supplierId}`);
  revalidatePath("/shortlists");
  return { ok: true };
}

export async function verifyDocumentAction(supplierId: string, documentId: string, approve: boolean, reason?: string) {
  const user = await requireProcurement();
  await loadSupplier(supplierId, user.organizationId);
  const doc = await prisma.document.findFirst({ where: { id: documentId, supplierId } });
  if (!doc) return { ok: false, error: "Document not found" };
  await prisma.document.update({
    where: { id: documentId },
    data: approve
      ? { status: doc.expiryDate && doc.expiryDate < new Date() ? "EXPIRED" : "VALID", rejectionReason: null }
      : { status: "REJECTED", rejectionReason: reason || "Rejected" },
  });
  await logActivity({ organizationId: user.organizationId, actorId: user.id, supplierId, action: approve ? "DOCUMENT_VERIFIED" : "DOCUMENT_REJECTED", detail: doc.fileName });
  revalidatePath(`/suppliers/${supplierId}`);
  return { ok: true };
}
