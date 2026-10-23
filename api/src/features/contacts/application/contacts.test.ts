import { expect, test } from "vitest";
import type {
  Contact,
  ContactRepository,
  Recipient,
  RecipientDirectory,
} from "./ports.js";
import { addContact } from "./add-contact.js";
import { listContacts } from "./list-contacts.js";
import { lookupRecipient } from "./lookup-recipient.js";
import {
  ContactLimitReached,
  RecipientNotFound,
  SelfContact,
} from "../domain/contact-errors.js";

const recipients: Recipient[] = [
  { userId: "u-ana", phone: "+51911111111", walletId: "w-ana" },
  { userId: "u-beto", phone: "+51922222222", walletId: "w-beto" },
  { userId: "u-carla", phone: "+51933333333", walletId: "w-carla" },
];

// Inactive users are simply absent from the directory, as in the SQLite adapter.
const directory: RecipientDirectory = {
  findActiveByPhone: (phone) => recipients.find((r) => r.phone === phone) ?? null,
  findActiveByWalletId: (walletId) =>
    recipients.find((r) => r.walletId === walletId) ?? null,
};

class InMemoryContacts implements ContactRepository {
  readonly rows: { id: string; owner: string; contact: string; createdAt: string }[] = [];

  add(
    contact: { id: string; ownerUserId: string; contactUserId: string },
    createdAt: string,
  ): boolean {
    if (this.findRow(contact.ownerUserId, contact.contactUserId)) return false;
    this.rows.push({
      id: contact.id,
      owner: contact.ownerUserId,
      contact: contact.contactUserId,
      createdAt,
    });
    return true;
  }

  findByPair(ownerUserId: string, contactUserId: string): Contact | null {
    const row = this.findRow(ownerUserId, contactUserId);
    return row ? this.toContact(row) : null;
  }

  count(ownerUserId: string): number {
    return this.rows.filter((row) => row.owner === ownerUserId).length;
  }

  list(ownerUserId: string): Contact[] {
    return this.rows
      .filter((row) => row.owner === ownerUserId)
      .map((row) => this.toContact(row));
  }

  private findRow(owner: string, contact: string) {
    return this.rows.find((row) => row.owner === owner && row.contact === contact);
  }

  private toContact(row: { id: string; contact: string; createdAt: string }): Contact {
    const recipient = recipients.find((r) => r.userId === row.contact);
    if (!recipient) throw new Error("unknown contact user");
    return {
      id: row.id,
      phone: recipient.phone,
      walletId: recipient.walletId,
      createdAt: row.createdAt,
    };
  }
}

function setup(maxContacts = 100) {
  const contacts = new InMemoryContacts();
  let counter = 0;
  return {
    contacts,
    lookup: lookupRecipient({ directory }),
    add: addContact({
      directory,
      contacts,
      now: () => "2026-10-23T10:00:00.000Z",
      newId: () => `c-${String(++counter)}`,
      maxContacts,
    }),
    list: listContacts({ contacts }),
  };
}

test("Lookup existing wallet returns only the normalized phone and wallet id", () => {
  expect(setup().lookup("u-ana", "+51922222222")).toEqual({
    phone: "+51922222222",
    walletId: "w-beto",
  });
});

test("Lookup of a missing recipient is not found", () => {
  expect(() => setup().lookup("u-ana", "+51999999999")).toThrow(RecipientNotFound);
});

test("Lookup of the own phone is a self contact", () => {
  expect(() => setup().lookup("u-ana", "+51911111111")).toThrow(SelfContact);
});

test("Associate recipient stores one contact for the owner", () => {
  const { add, contacts } = setup();

  const result = add("u-ana", "w-beto");

  expect(result.created).toBe(true);
  expect(result.contact).toMatchObject({ phone: "+51922222222", walletId: "w-beto" });
  expect(contacts.rows).toHaveLength(1);
});

test("Adding the same contact twice returns the same contact without a new row", () => {
  const { add, contacts } = setup();

  const first = add("u-ana", "w-beto");
  const second = add("u-ana", "w-beto");

  expect(second).toEqual({ contact: first.contact, created: false });
  expect(contacts.rows).toHaveLength(1);
});

test("Adding an unknown wallet or yourself fails", () => {
  const { add } = setup();

  expect(() => add("u-ana", "w-nobody")).toThrow(RecipientNotFound);
  expect(() => add("u-ana", "w-ana")).toThrow(SelfContact);
});

test("A new contact beyond the limit is refused but a duplicate still succeeds", () => {
  const { add } = setup(1);
  add("u-ana", "w-beto");

  expect(() => add("u-ana", "w-carla")).toThrow(ContactLimitReached);
  expect(add("u-ana", "w-beto").created).toBe(false);
});

test("Each owner lists only their own contacts and an empty list is empty", () => {
  const { add, list } = setup();
  add("u-ana", "w-beto");

  expect(list("u-ana")).toHaveLength(1);
  expect(list("u-beto")).toEqual([]);
});
