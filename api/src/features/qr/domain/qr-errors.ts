export class QrNotFound extends Error {
  readonly code = "QR_NOT_FOUND";
  constructor() {
    super("No encontramos ese código QR.");
  }
}

export class QrExpired extends Error {
  readonly code = "QR_EXPIRED";
  constructor() {
    super("El código QR venció. Pide uno nuevo.");
  }
}

export class SelfQr extends Error {
  readonly code = "SELF_QR";
  constructor() {
    super("No puedes pagar tu propio código QR.");
  }
}

export class InvalidQrAmount extends Error {
  readonly code = "VALIDATION_ERROR";
  constructor() {
    super("Monto del código QR no válido.");
  }
}
