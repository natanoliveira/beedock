export type OrgHeaderProps = {
  organizationName: string;
  logoUrl: string | null;
  userName: string;
  roleLabel: string;
  logoutAction: () => Promise<void>;
};
