import { prisma } from "@/lib/prisma";
import type { NotificationType } from "@prisma/client";

/** Append an immutable entry to the tenant audit log. */
export async function logActivity(params: {
  organizationId: string;
  actorId?: string | null;
  supplierId?: string | null;
  action: string;
  detail?: string | null;
}) {
  await prisma.activityLog.create({
    data: {
      organizationId: params.organizationId,
      actorId: params.actorId ?? null,
      supplierId: params.supplierId ?? null,
      action: params.action,
      detail: params.detail ?? null,
    },
  });
}

/** Create an in-app notification for a user. */
export async function notify(params: {
  organizationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
}) {
  await prisma.notification.create({
    data: {
      organizationId: params.organizationId,
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
    },
  });
}
