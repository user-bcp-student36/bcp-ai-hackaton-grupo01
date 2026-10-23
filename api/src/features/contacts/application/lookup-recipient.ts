import { RecipientNotFound, SelfContact } from "../domain/contact-errors.js";
import type { RecipientDirectory } from "./ports.js";

type Dependencies = { directory: RecipientDirectory };

export function lookupRecipient(deps: Dependencies) {
  return (ownerUserId: string, phone: string): { phone: string; walletId: string } => {
    const recipient = deps.directory.findActiveByPhone(phone);
    if (recipient === null) throw new RecipientNotFound();
    if (recipient.userId === ownerUserId) throw new SelfContact();
    return { phone: recipient.phone, walletId: recipient.walletId };
  };
}
