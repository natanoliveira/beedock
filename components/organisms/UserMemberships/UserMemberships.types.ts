type Role = "ADMIN" | "FUNCIONARIO";
type FormState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string>; values?: Record<string, unknown> };

export type UserMembership = { id: string; organizationId: string; organizationName: string; role: Role; active: boolean };

export type UserMembershipsProps = {
  userName: string;
  userEmail: string;
  memberships: UserMembership[];
  /** Empresas (ACTIVE/SUSPENDED) ainda sem vínculo ativo com o usuário. */
  linkableOrganizations: { id: string; name: string }[];
  changeRoleAction: (organizationId: string, membershipId: string, role: Role) => Promise<FormState>;
  setActiveAction: (organizationId: string, membershipId: string, active: boolean) => Promise<FormState>;
  linkAction: (prev: FormState, fd: FormData) => Promise<FormState>;
};
