export type QrCode = {
  id: string;
  walletId: string;
  ownerUserId: string;
  ownerPhone: string;
  amountCents: number | null;
  expiresAt: string;
};

export interface QrRepository {
  // Returns null when the user has no wallet.
  create(input: {
    id: string;
    ownerUserId: string;
    amountCents: number | null;
    createdAt: string;
    expiresAt: string;
  }): QrCode | null;
  findById(id: string): QrCode | null;
}
