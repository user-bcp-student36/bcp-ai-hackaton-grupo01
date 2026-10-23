// Stand-in for the saved-contact list of the contacts feature (#30); replace when it merges.
export type SavedContact = { walletId: string; name: string };

export const DEMO_CONTACTS: readonly SavedContact[] = [
  { walletId: "wallet-demo-ana", name: "Ana Quispe" },
  { walletId: "wallet-demo-carlos", name: "Carlos Huamán" },
];

export function findContact(walletId: string): SavedContact | undefined {
  return DEMO_CONTACTS.find((contact) => contact.walletId === walletId);
}
