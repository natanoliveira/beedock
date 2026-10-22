export type OrgSwitcherProps = {
  options: { id: string; name: string }[];
  currentId: string | null;
  label: string;
  switchAction: (organizationId: string) => Promise<{ error?: string }>;
};
