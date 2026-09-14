import { Badge } from "./ui";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/labels";
import type { RequestStatus } from "@/types/database";

export function StatusBadge({ status }: { status: RequestStatus }) {
  return <Badge className={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}
