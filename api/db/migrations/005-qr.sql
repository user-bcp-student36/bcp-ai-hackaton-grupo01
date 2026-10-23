CREATE TABLE qr_codes (
  id TEXT PRIMARY KEY NOT NULL,
  wallet_id TEXT NOT NULL REFERENCES wallets(id),
  amount_cents INTEGER CHECK (
    amount_cents IS NULL OR (typeof(amount_cents) = 'integer' AND amount_cents BETWEEN 1 AND 100000000)
  ),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX qr_codes_wallet_created ON qr_codes (wallet_id, created_at);
