-- Papel da aplicação: sem BYPASSRLS, sem ser dono das tabelas (dono ignora RLS).
-- A senha é definida fora das migrations: ALTER ROLE beedock_app WITH LOGIN PASSWORD '...';
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'beedock_app') THEN
    CREATE ROLE beedock_app NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO beedock_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO beedock_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO beedock_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO beedock_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO beedock_app;
REVOKE ALL ON "_prisma_migrations" FROM beedock_app;

-- Contexto da transação (set_config(..., true) vale só até o COMMIT)
CREATE FUNCTION app_current_org() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.current_org', true), '') $$;

CREATE FUNCTION app_is_platform() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('app.platform', true), '') = 'on' $$;

-- Isolamento estrito: dados financeiros e cadastros só da empresa da transação
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'OrganizationSettings', 'Customer', 'ProductType', 'Category',
    'PaymentMethod', 'Order', 'OrderPayment', 'Transaction'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("organizationId" = app_current_org()) WITH CHECK ("organizationId" = app_current_org())',
      t
    );
  END LOOP;
END
$$;

-- Convites: a plataforma cria o convite do Admin e o aceite acontece antes de existir sessão
ALTER TABLE "Invitation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_or_platform ON "Invitation"
  USING ("organizationId" = app_current_org() OR app_is_platform())
  WITH CHECK ("organizationId" = app_current_org() OR app_is_platform());

-- Auditoria: append-only
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_read ON "AuditLog" FOR SELECT
  USING ("organizationId" = app_current_org() OR app_is_platform());
CREATE POLICY audit_insert ON "AuditLog" FOR INSERT
  WITH CHECK ("organizationId" = app_current_org() OR app_is_platform() OR "organizationId" IS NULL);

REVOKE UPDATE, DELETE, TRUNCATE ON "AuditLog" FROM beedock_app;

CREATE FUNCTION audit_log_immutable() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog é somente inserção (% bloqueado)', TG_OP;
END
$$;

CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();
