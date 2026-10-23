import { useSession } from "../../lib/session";
import type { ReceiptSession } from "./paymentsClient";

/** The signed-in user's token and wallet, or null when signed out or without a wallet. */
export function useReceiptSession(): ReceiptSession | null {
  const { session } = useSession();
  if (!session?.user.walletId) return null;
  return { accessToken: session.token, walletId: session.user.walletId };
}
