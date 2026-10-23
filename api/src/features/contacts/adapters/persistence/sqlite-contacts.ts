import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type {
  Contact,
  ContactRepository,
  Recipient,
  RecipientDirectory,
} from "../../application/ports.js";
import { contactDisplayName } from "../../domain/display-name.js";

// Supplied by the composition root; null when the name is unknown.
export type FullNameOf = (phone: string) => string | null;
const unknownName: FullNameOf = () => null;

const recipientRow = z.object({
  user_id: z.string(),
  phone: z.string(),
  wallet_id: z.string(),
});
const contactRow = z.object({
  id: z.string(),
  phone: z.string(),
  full_name: z.string().nullable(),
  wallet_id: z.string(),
  created_at: z.string(),
});

const recipientSelect = `SELECT u.id AS user_id, u.phone, w.id AS wallet_id
  FROM users u JOIN wallets w ON w.user_id = u.id`;
const contactSelect = `SELECT c.id, u.phone, u.full_name, w.id AS wallet_id, c.created_at
  FROM contacts c
  JOIN users u ON u.id = c.contact_user_id
  JOIN wallets w ON w.user_id = u.id`;

function mapContact(row: unknown, fullNameOf: FullNameOf): Contact {
  const parsed = contactRow.parse(row);
  return {
    id: parsed.id,
    phone: parsed.phone,
    displayName: contactDisplayName(
      parsed.full_name ?? fullNameOf(parsed.phone),
      parsed.phone,
    ),
    walletId: parsed.wallet_id,
    createdAt: parsed.created_at,
  };
}

export class SqliteRecipientDirectory implements RecipientDirectory {
  constructor(private readonly database: DatabaseSync) {}

  findActiveByPhone(phone: string): Recipient | null {
    return this.find("u.phone = ?", phone);
  }

  findActiveByWalletId(walletId: string): Recipient | null {
    return this.find("w.id = ?", walletId);
  }

  private find(condition: string, value: string): Recipient | null {
    const row = this.database
      .prepare(`${recipientSelect} WHERE u.active = 1 AND ${condition}`)
      .get(value);
    if (!row) return null;
    const parsed = recipientRow.parse(row);
    return {
      userId: parsed.user_id,
      phone: parsed.phone,
      walletId: parsed.wallet_id,
    };
  }
}

export class SqliteContacts implements ContactRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly fullNameOf: FullNameOf = unknownName,
  ) {}

  add(
    contact: { id: string; ownerUserId: string; contactUserId: string },
    createdAt: string,
  ): boolean {
    const result = this.database
      .prepare(
        `INSERT INTO contacts (id, owner_user_id, contact_user_id, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (owner_user_id, contact_user_id) DO NOTHING`,
      )
      .run(contact.id, contact.ownerUserId, contact.contactUserId, createdAt);
    return result.changes === 1;
  }

  findByPair(ownerUserId: string, contactUserId: string): Contact | null {
    const row = this.database
      .prepare(
        `${contactSelect} WHERE c.owner_user_id = ? AND c.contact_user_id = ?`,
      )
      .get(ownerUserId, contactUserId);
    return row ? mapContact(row, this.fullNameOf) : null;
  }

  count(ownerUserId: string): number {
    const row = this.database
      .prepare("SELECT COUNT(*) AS total FROM contacts WHERE owner_user_id = ?")
      .get(ownerUserId);
    return z.object({ total: z.number() }).parse(row).total;
  }

  list(ownerUserId: string): Contact[] {
    return this.database
      .prepare(
        `${contactSelect} WHERE c.owner_user_id = ? ORDER BY c.created_at ASC, c.id ASC`,
      )
      .all(ownerUserId)
      .map((row) => mapContact(row, this.fullNameOf));
  }
}
