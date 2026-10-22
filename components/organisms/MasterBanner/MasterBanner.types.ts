export type MasterBannerProps = {
  organizationName: string;
  actingAsMaster: boolean;
  leaveAction: () => Promise<unknown>;
};
