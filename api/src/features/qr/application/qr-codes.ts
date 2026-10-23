import { QR_PAYLOAD_PREFIX, QR_TTL_SECONDS } from "@wallet/contracts/qr";
import { InvalidQrAmount, QrExpired, QrNotFound, SelfQr } from "../domain/qr-errors.js";
import type { QrRepository } from "./ports.js";

type Dependencies = {
  qrs: QrRepository;
  maxAmountCents: number;
  now: () => Date;
  newId: () => string;
};

export function createQr(deps: Dependencies) {
  return (ownerUserId: string, amountCents: number | null) => {
    if (amountCents !== null && (amountCents < 1 || amountCents > deps.maxAmountCents)) {
      throw new InvalidQrAmount();
    }
    const createdAt = deps.now();
    const expiresAt = new Date(createdAt.getTime() + QR_TTL_SECONDS * 1000);
    const qr = deps.qrs.create({
      id: deps.newId(),
      ownerUserId,
      amountCents,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
    if (qr === null) throw new Error("QR owner has no wallet.");
    return {
      id: qr.id,
      payload: `${QR_PAYLOAD_PREFIX}${qr.id}`,
      amountCents: qr.amountCents,
      expiresAt: qr.expiresAt,
    };
  };
}

export function resolveQr(deps: Pick<Dependencies, "qrs" | "now">) {
  return (viewerUserId: string, payload: string) => {
    const id = payload.slice(QR_PAYLOAD_PREFIX.length);
    const qr = deps.qrs.findById(id);
    if (qr === null) throw new QrNotFound();
    if (Date.parse(qr.expiresAt) <= deps.now().getTime()) throw new QrExpired();
    if (qr.ownerUserId === viewerUserId) throw new SelfQr();
    return {
      id: qr.id,
      recipientWalletId: qr.walletId,
      recipientPhone: qr.ownerPhone,
      amountCents: qr.amountCents,
      expiresAt: qr.expiresAt,
    };
  };
}
