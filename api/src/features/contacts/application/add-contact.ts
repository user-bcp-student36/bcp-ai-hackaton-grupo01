import {
  ContactLimitReached,
  RecipientNotFound,
  SelfContact,
} from "../domain/contact-errors.js";
import type { Contact, ContactRepository, RecipientDirectory } from "./ports.js";

type Dependencies = {
  directory: RecipientDirectory;
  contacts: ContactRepository;
  now: () => string;
  newId: () => string;
  maxContacts: number;
};

export type AddContactResult = { contact: Contact; created: boolean };

// The recipient is revalidated here: an earlier lookup is never trusted.
export function addContact(deps: Dependencies) {
  return (ownerUserId: string, walletId: string): AddContactResult => {
    const recipient = deps.directory.findActiveByWalletId(walletId);
    if (recipient === null) throw new RecipientNotFound();
    if (recipient.userId === ownerUserId) throw new SelfContact();

    const existing = deps.contacts.findByPair(ownerUserId, recipient.userId);
    if (existing) return { contact: existing, created: false };
    if (deps.contacts.count(ownerUserId) >= deps.maxContacts) {
      throw new ContactLimitReached();
    }

    const inserted = deps.contacts.add(
      { id: deps.newId(), ownerUserId, contactUserId: recipient.userId },
      deps.now(),
    );
    const contact = deps.contacts.findByPair(ownerUserId, recipient.userId);
    if (contact === null) throw new Error("Saved contact could not be read back");
    return { contact, created: inserted };
  };
}
