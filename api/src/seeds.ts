import type { DatabaseSync } from "node:sqlite";
import { seedContactRecipient } from "./seeds/contacts.js";

export const demoSeeds: readonly ((database: DatabaseSync) => void)[] = [
  seedContactRecipient,
];
