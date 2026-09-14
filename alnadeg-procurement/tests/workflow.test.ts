import { describe, expect, it } from "vitest";
import { APPROVAL_FLOW, GLOBAL_SCOPE_ROLES, REQUESTER_ROLES, STAGE_ROLE } from "@/lib/constants";
import { ROLE_LABEL, STAGE_LABEL, STATUS_LABEL } from "@/lib/labels";
import { formatFileSize, formatMoney } from "@/lib/format";
import type { RequestStatus, UserRole } from "@/types/database";

describe("مسار الاعتماد", () => {
  it("يتكون من خمس مراحل بالترتيب المعتمد", () => {
    expect(APPROVAL_FLOW).toEqual([
      "production_officer", "branch_manager",
      "production_manager", "procurement", "finance",
    ]);
  });

  it("لكل مرحلة دور واحد مخوَّل", () => {
    for (const stage of APPROVAL_FLOW) {
      expect(STAGE_ROLE[stage]).toBeTruthy();
    }
    // لا يتكرر دور على مرحلتين
    const roles = APPROVAL_FLOW.map((s) => STAGE_ROLE[s]);
    expect(new Set(roles).size).toBe(roles.length);
  });

  it("مقدم الطلب لا يملك أي مرحلة اعتماد", () => {
    expect(Object.values(STAGE_ROLE)).not.toContain("requester");
  });

  it("الأدوار المركزية وحدها ترى كل المواقع", () => {
    expect(GLOBAL_SCOPE_ROLES).toContain("super_admin");
    expect(GLOBAL_SCOPE_ROLES).toContain("finance");
    expect(GLOBAL_SCOPE_ROLES).not.toContain("requester");
    expect(GLOBAL_SCOPE_ROLES).not.toContain("branch_manager");
    expect(GLOBAL_SCOPE_ROLES).not.toContain("production_officer");
  });

  it("إنشاء الطلب متاح للأدوار الميدانية فقط", () => {
    expect(REQUESTER_ROLES).toContain("requester");
    expect(REQUESTER_ROLES).not.toContain("finance");
    expect(REQUESTER_ROLES).not.toContain("procurement");
  });
});

describe("التسميات العربية", () => {
  it("لكل دور تسمية", () => {
    const roles: UserRole[] = ["super_admin", "requester", "production_officer",
      "branch_manager", "production_manager", "procurement", "finance"];
    for (const r of roles) expect(ROLE_LABEL[r]).toBeTruthy();
  });

  it("لكل حالة تسمية", () => {
    const statuses: RequestStatus[] = ["draft", "submitted",
      "pending_production_officer", "pending_branch_manager",
      "pending_production_manager", "pending_procurement", "pending_finance",
      "returned", "rejected", "completed", "cancelled"];
    expect(statuses).toHaveLength(11);
    for (const s of statuses) expect(STATUS_LABEL[s]).toBeTruthy();
  });

  it("لكل مرحلة تسمية", () => {
    for (const s of APPROVAL_FLOW) expect(STAGE_LABEL[s]).toBeTruthy();
  });
});

describe("التنسيق", () => {
  it("ينسّق المبالغ بالريال", () => {
    expect(formatMoney(1150)).toContain("ر.س");
    expect(formatMoney(null)).toBe("—");
  });

  it("ينسّق أحجام الملفات", () => {
    expect(formatFileSize(500)).toContain("بايت");
    expect(formatFileSize(5000)).toContain("كيلوبايت");
    expect(formatFileSize(5_000_000)).toContain("ميجابايت");
  });
});
