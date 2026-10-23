import type { Contact, ContactRepository } from "./ports.js";

export function listContacts(deps: { contacts: ContactRepository }) {
  return (ownerUserId: string): Contact[] => deps.contacts.list(ownerUserId);
}
