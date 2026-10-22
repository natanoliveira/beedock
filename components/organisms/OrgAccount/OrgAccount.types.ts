export type OrgAccountProps = {
  userName: string;
  roleLabel: string;
  logoutAction: () => Promise<void>;
};
