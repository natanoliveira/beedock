-- Vínculos e acessos de suporte: a empresa vê só os seus; a plataforma (login, painel MASTER) vê todos
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_or_platform ON "Membership"
  USING ("organizationId" = app_current_org() OR app_is_platform())
  WITH CHECK ("organizationId" = app_current_org() OR app_is_platform());

ALTER TABLE "SupportAccessGrant" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_or_platform ON "SupportAccessGrant"
  USING ("organizationId" = app_current_org() OR app_is_platform())
  WITH CHECK ("organizationId" = app_current_org() OR app_is_platform());
