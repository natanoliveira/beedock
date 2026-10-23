-- Termos publicados e aceites são prova legal: o app só insere e lê.
REVOKE UPDATE, DELETE, TRUNCATE ON "LegalDocument" FROM beedock_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "LegalAcceptance" FROM beedock_app;
