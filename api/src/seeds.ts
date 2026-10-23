import type { DatabaseSync } from "node:sqlite";
import { seedContactRecipient } from "./seeds/contacts.js";
import { seedFailingRecipients } from "./seeds/failing-recipients.js";

export const demoSeeds: readonly ((database: DatabaseSync) => void)[] = [
  seedContactRecipient,
  seedFailingRecipients,
];
