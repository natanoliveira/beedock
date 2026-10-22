export type UserListMembership = { id: string; organizationId: string; organizationName: string; role: "ADMIN" | "FUNCIONARIO"; active: boolean };

export type UserListItem = {
  id: string;
  name: string;
  email: string;
  isMaster: boolean;
  locked: boolean;
  lastSeenAt: Date | null;
  memberships: UserListMembership[];
};

export type UserListProps = {
  users: UserListItem[];
  organizations: { id: string; name: string }[];
  total: number;
  pageSize: number;
  filters: { q?: string; empresa?: string; pagina: number };
};
