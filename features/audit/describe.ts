import { brl } from "@/features/transactions/pdf-kit";

export type DescribableEvent = {
  action: string;
  userName: string | null;
  userRole: string | null;
  result: "SUCCESS" | "DENIED" | "FAILED";
  entityType: string | null;
  before: unknown;
  after: unknown;
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Nome do registro a partir do que foi gravado: descrição, nome ou número. */
function label(e: DescribableEvent): string {
  const a = obj(e.after);
  const b = obj(e.before);
  const name = str(a.description) ?? str(b.description) ?? str(a.name) ?? str(b.name);
  if (name) return `'${name}'`;
  const n = a.number ?? b.number;
  return typeof n === "number" ? `#${n}` : "";
}

const AMOUNT_KEYS = ["amountCents", "totalCents"];

function amountChange(e: DescribableEvent): string {
  const a = obj(e.after);
  const b = obj(e.before);
  for (const k of AMOUNT_KEYS) {
    if (typeof a[k] === "number" && typeof b[k] === "number") return `: valor de ${brl(b[k] as number)} para ${brl(a[k] as number)}`;
  }
  return "";
}

const amountOf = (e: DescribableEvent): string => {
  const a = obj(e.after);
  const k = AMOUNT_KEYS.find((x) => typeof a[x] === "number");
  return k ? ` de ${brl(a[k] as number)}` : "";
};

const withLabel = (verb: string, noun: string, e: DescribableEvent, extra = "") => {
  const l = label(e);
  return `${verb} ${noun}${l ? ` ${l}` : ""}${extra}`;
};

/** action → predicado (sem o nome de quem fez). */
const PHRASES: Record<string, (e: DescribableEvent) => string> = {
  "auth.login": () => "entrou no sistema",
  "auth.logout": () => "saiu do sistema",
  "auth.login_failed": () => "errou a senha ao entrar",
  "auth.login_blocked": () => "tentou entrar com acesso bloqueado",
  "auth.login_inactive": () => "tentou entrar com conta inativa",
  "auth.locked": () => "teve o acesso bloqueado após várias tentativas",
  "auth.terms_accept": () => "aceitou os termos e a política de privacidade",
  "auth.switch_org": () => "trocou de empresa",
  "transaction.create": (e) => withLabel("registrou", "o lançamento", e, amountOf(e)),
  "transaction.update": (e) => withLabel("editou", "o lançamento", e, amountChange(e)),
  "transaction.delete": (e) => withLabel("excluiu", "o lançamento", e),
  "transaction.receipt_issue": (e) => withLabel("emitiu o recibo do", "lançamento", e),
  "transaction.receipt_view": (e) => withLabel("abriu o comprovante do", "lançamento", e),
  "order.create": (e) => withLabel("criou", "o pedido", e, amountOf(e)),
  "order.update": (e) => withLabel("editou", "o pedido", e, amountChange(e)),
  "order.delete": (e) => withLabel("excluiu", "o pedido", e),
  "order.cancel": (e) => withLabel("cancelou", "o pedido", e),
  "order.status_change": (e) => {
    const a = str(obj(e.after).status);
    return withLabel("mudou o status do", "pedido", e, a ? ` para ${a}` : "");
  },
  "order.receipt_issue": (e) => withLabel("emitiu o recibo do", "pedido", e),
  "order_payment.create": (e) => withLabel("registrou recebimento", "", e, amountOf(e)).replace("  ", " "),
  "order_payment.update": (e) => `editou um recebimento${amountChange(e)}`,
  "order_payment.delete": () => "excluiu um recebimento",
  "customer.create": (e) => withLabel("cadastrou", "o cliente", e),
  "customer.update": (e) => withLabel("editou", "o cliente", e),
  "customer.delete": (e) => withLabel("excluiu", "o cliente", e),
  "customer.anonymize": () => "anonimizou um cliente",
  "category.create": (e) => withLabel("criou", "a categoria", e),
  "category.update": (e) => withLabel("editou", "a categoria", e),
  "payment_method.create": (e) => withLabel("criou", "a forma de pagamento", e),
  "payment_method.update": (e) => withLabel("editou", "a forma de pagamento", e),
  "product_type.create": (e) => withLabel("criou", "o tipo de produto", e),
  "product_type.update": (e) => withLabel("editou", "o tipo de produto", e),
  "organization.update": () => "alterou as configurações da empresa",
  "member.create": (e) => withLabel("adicionou", "o membro", e),
  "member.role_change": () => "mudou o papel de um membro",
  "member.reactivate": () => "reativou um membro",
  "invitation.create": () => "enviou um convite",
  "invitation.revoke": () => "revogou um convite",
  "invitation.accept": () => "aceitou um convite",
  "invitation.invalid": () => "usou um link de convite inválido",
  "report.export": () => "exportou um relatório",
  "audit.export": () => "exportou a auditoria",
  "customer.export": () => "exportou os dados de um cliente",
  "member.export": () => "exportou os dados de um membro",
  "organization.export": () => "exportou os dados da empresa",
  "platform.audit_export": () => "exportou a auditoria da plataforma",
  "platform.organization_export": () => "exportou os dados de uma empresa",
  "platform.legal_publish": () => "publicou uma nova versão dos termos",
  "platform.organization_create": (e) => withLabel("criou", "a empresa", e),
  "platform.organization_update": (e) => withLabel("alterou", "a empresa", e),
  "platform.org_enter": () => "entrou numa empresa",
  "platform.org_leave": () => "saiu de uma empresa",
  "platform.master_seed": () => "criou o usuário MASTER",
  "platform.master_upsert": () => "atualizou o usuário MASTER",
};

export function describeEvent(e: DescribableEvent): { text: string; tone: "normal" | "alert" } {
  const who = `${e.userName ?? "Sistema"}${e.userRole === "MASTER" ? " (MASTER)" : ""}`;
  if (e.result === "DENIED") return { text: `Acesso negado: ${who} tentou ${e.action}`, tone: "alert" };
  const phrase = PHRASES[e.action];
  const text = `${who} ${phrase ? phrase(e) : `executou ${e.action}`}`;
  return { text: e.result === "FAILED" ? `Falhou: ${text}` : text, tone: e.result === "FAILED" ? "alert" : "normal" };
}

export const ACTION_GROUPS = {
  lancamentos: { label: "Lançamentos", prefixes: ["transaction."] },
  pedidos: { label: "Pedidos", prefixes: ["order.", "order_payment."] },
  clientes: { label: "Clientes", prefixes: ["customer."] },
  equipe: { label: "Equipe", prefixes: ["member.", "invitation."] },
  configuracoes: { label: "Configurações", prefixes: ["category.", "payment_method.", "product_type.", "organization.update"] },
  acesso: { label: "Acesso", prefixes: ["auth."] },
  exportacoes: {
    label: "Exportações",
    prefixes: [
      "report.export",
      "audit.export",
      "customer.export",
      "member.export",
      "organization.export",
      "platform.audit_export",
      "platform.organization_export",
    ],
  },
  negados: { label: "Negados", prefixes: [] },
} as const satisfies Record<string, { label: string; prefixes: readonly string[] }>;

export type ActionGroup = keyof typeof ACTION_GROUPS;

/** Cláusula Prisma do grupo: prefixos de `action`; "negados" filtra pelo resultado. */
export function groupWhere(group: ActionGroup): object {
  if (group === "negados") return { result: "DENIED" };
  return { OR: ACTION_GROUPS[group].prefixes.map((p) => ({ action: { startsWith: p } })) };
}
