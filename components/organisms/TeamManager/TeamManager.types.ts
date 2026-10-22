type Role = "ADMIN" | "FUNCIONARIO";
type FormState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string>; values?: Record<string, unknown> };

export type TeamMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  lastSeenAt: Date | null;
};

export type TeamInvite = { id: string; name: string; email: string; phone: string | null; role: Role; expiresAt: Date };

export type InviteState = FormState & { inviteUrl?: string };

export type TeamManagerProps = {
  members: TeamMember[];
  invites: TeamInvite[];
  currentUserId: string;
  flashUrl?: string | null;
  consumeFlash?: () => Promise<void>;
  inviteAction: (prev: InviteState, fd: FormData) => Promise<InviteState>;
  changeRoleAction: (membershipId: string, role: Role) => Promise<FormState>;
  setActiveAction: (membershipId: string, active: boolean) => Promise<FormState>;
  revokeInviteAction: (invitationId: string) => Promise<FormState>;
  /** Só MASTER. */
  linkAction?: (prev: FormState, fd: FormData) => Promise<FormState>;
  organizationId?: string;
};
