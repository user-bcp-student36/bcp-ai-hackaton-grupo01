export type Recipient = { userId: string; phone: string; walletId: string };

export type Contact = {
  id: string;
  phone: string;
  walletId: string;
  createdAt: string;
};

// Reads the directory of active users that have a wallet.
export interface RecipientDirectory {
  findActiveByPhone(phone: string): Recipient | null;
  findActiveByWalletId(walletId: string): Recipient | null;
}

export interface ContactRepository {
  // Returns false when the owner already saved this recipient.
  add(
    contact: { id: string; ownerUserId: string; contactUserId: string },
    createdAt: string,
  ): boolean;
  findByPair(ownerUserId: string, contactUserId: string): Contact | null;
  count(ownerUserId: string): number;
  list(ownerUserId: string): Contact[];
}
