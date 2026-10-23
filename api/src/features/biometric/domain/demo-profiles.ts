export type DemoProfile = {
  documentNumber: string;
  fullName: string;
  phone: string;
  email: string;
};

// Fictitious identities allowed to enter with the simulated face check.
const DEMO_PROFILES: readonly DemoProfile[] = [
  {
    documentNumber: "72193412",
    fullName: "Andrés Koga",
    phone: "+51987000001",
    email: "andres.koga@example.com",
  },
  {
    documentNumber: "45871236",
    fullName: "María Quispe",
    phone: "+51987000002",
    email: "maria.quispe@example.com",
  },
];

export function findDemoProfile(documentNumber: string): DemoProfile | null {
  return (
    DEMO_PROFILES.find((profile) => profile.documentNumber === documentNumber) ??
    null
  );
}

export class BiometricNotEnabled extends Error {
  readonly code = "BIOMETRIC_NOT_ENABLED";
  constructor() {
    super("Este documento no tiene acceso biométrico habilitado.");
  }
}
