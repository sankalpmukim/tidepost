-- Demo accounts share one fixed email address and must be allowed per user;
-- only real provider identities (gmail/outlook) are globally unique.
DROP INDEX IF EXISTS idx_accounts_identity;
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_identity ON accounts(provider, email) WHERE provider != 'demo';
