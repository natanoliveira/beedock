export type InviteLinkProps = { url: string; phone: string | null; emailStatus?: "sent" | "skipped" | "failed"; emailTo?: string };
