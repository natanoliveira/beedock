import type { MemberRole } from "@/generated/prisma/enums";

const BOTH: readonly MemberRole[] = ["ADMIN", "FUNCIONARIO"];
const ADMIN: readonly MemberRole[] = ["ADMIN"];

// Matriz papel × ação. Funcionário edita qualquer registro da empresa (auditoria registra quem), não exclui.
export const PERMISSIONS = {
  "dashboard.view": BOTH,
  "profit.view": ADMIN,
  "report.view": ADMIN,
  "report.export": ADMIN,
  "transaction.view": BOTH,
  "transaction.create": BOTH,
  "transaction.update": BOTH,
  "transaction.delete": ADMIN,
  "order.view": BOTH,
  "order.create": BOTH,
  "order.update": BOTH,
  "order.delete": ADMIN,
  "customer.view": BOTH,
  "customer.create": BOTH,
  "customer.update": BOTH,
  "customer.delete": ADMIN,
  "customer.export": ADMIN,
  "customer.anonymize": ADMIN,
  "member.manage": ADMIN,
  "settings.manage": ADMIN,
  "company.export": ADMIN,
  "audit.view": ADMIN,
} as const satisfies Record<string, readonly MemberRole[]>;

export type Action = keyof typeof PERMISSIONS;

export function can(role: MemberRole, action: Action): boolean {
  return PERMISSIONS[action].includes(role);
}

export class ForbiddenError extends Error {
  constructor() {
    super("Você não tem permissão para esta ação.");
  }
}
