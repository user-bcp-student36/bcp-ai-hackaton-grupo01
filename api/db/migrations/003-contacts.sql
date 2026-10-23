CREATE TABLE contacts (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  contact_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE (owner_user_id, contact_user_id),
  CHECK (owner_user_id <> contact_user_id)
);
CREATE INDEX contacts_owner_created ON contacts (owner_user_id, created_at, id);
