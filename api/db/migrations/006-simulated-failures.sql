CREATE TABLE simulated_failures (
  wallet_id TEXT PRIMARY KEY NOT NULL REFERENCES wallets(id),
  mode TEXT NOT NULL CHECK (mode IN ('declined', 'timeout', 'intermittent'))
);
