export class RecipientNotFound extends Error {
  readonly code = "RECIPIENT_NOT_FOUND";
  constructor() {
    super("No encontramos un destinatario activo.");
  }
}

export class SelfContact extends Error {
  readonly code = "SELF_CONTACT";
  constructor() {
    super("No puedes agregarte a ti mismo como contacto.");
  }
}

export class ContactLimitReached extends Error {
  readonly code = "CONTACT_LIMIT_REACHED";
  constructor() {
    super("Alcanzaste el máximo de contactos.");
  }
}
