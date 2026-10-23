export type PaymentRecord = {
  id: string;
  sourceWalletId: string;
  destinationWalletId: string;
  recipientType: "contact";
  amountCents: number;
  currency: "PEN";
  status: "SUCCEEDED";
  createdAt: string;
};

export type ActiveWallet = {
  id: string;
  userId: string;
  balanceCents: number;
};

export type RetryKeyRecord = {
  fingerprint: string;
  paymentId: string;
};

// Answers whether a wallet belongs to a saved contact of the owner; the contacts feature implements it later.
export interface ContactReader {
  hasSavedContactWallet(ownerUserId: string, walletId: string): boolean;
}

export interface PaymentTransaction {
  findRetryKey(sourceUserId: string, key: string): RetryKeyRecord | null;
  findPaymentById(paymentId: string): PaymentRecord | null;
  findActiveWalletByUserId(userId: string): ActiveWallet | null;
  findActiveWalletById(walletId: string): ActiveWallet | null;
  // Conditional: false when funds are insufficient, nothing changes.
  debit(walletId: string, amountCents: number, updatedAt: string): boolean;
  // Conditional: false when the credit would exceed the storage cap, nothing changes.
  credit(walletId: string, amountCents: number, updatedAt: string): boolean;
  insertPayment(payment: PaymentRecord): void;
  insertRetryKey(input: {
    sourceUserId: string;
    key: string;
    fingerprint: string;
    paymentId: string;
    createdAt: string;
  }): void;
}

export interface PaymentLedger {
  // Runs work in one write transaction; any throw rolls back every write.
  transact<T>(work: (transaction: PaymentTransaction) => T): T;
  findPaymentByRetryKey(sourceUserId: string, key: string): PaymentRecord | null;
  findPaymentForParticipant(paymentId: string, userId: string): PaymentRecord | null;
}
