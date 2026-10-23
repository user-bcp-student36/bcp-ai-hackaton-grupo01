CREATE TABLE payments (
  id TEXT PRIMARY KEY NOT NULL,
  source_wallet_id TEXT NOT NULL REFERENCES wallets(id),
  destination_wallet_id TEXT NOT NULL REFERENCES wallets(id),
  recipient_type TEXT NOT NULL CHECK (recipient_type = 'contact'),
  amount_cents INTEGER NOT NULL CHECK (
    typeof(amount_cents) = 'integer' AND amount_cents BETWEEN 1 AND 100000000
  ),
  currency TEXT NOT NULL CHECK (currency = 'PEN'),
  status TEXT NOT NULL CHECK (status = 'SUCCEEDED'),
  created_at TEXT NOT NULL,
  CHECK (source_wallet_id <> destination_wallet_id)
);
CREATE INDEX payments_source_wallet_created ON payments (source_wallet_id, created_at, id);
CREATE INDEX payments_destination_wallet_created ON payments (destination_wallet_id, created_at, id);
CREATE TABLE payment_keys (
  source_user_id TEXT NOT NULL REFERENCES users(id),
  key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  payment_id TEXT NOT NULL UNIQUE REFERENCES payments(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (source_user_id, key)
);
