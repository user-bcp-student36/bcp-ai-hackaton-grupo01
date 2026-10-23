// Users have no name column: contacts show these demo names, always obfuscated by the API.
const SEED_FULL_NAMES: Readonly<Record<string, string>> = {
  "+51900000001": "Rosa Mendoza",
  "+51900000002": "Diego Rechazo",
  "+51900000003": "Tomás Espera",
  "+51900000004": "Irene Intermitente",
  "+51900000010": "Ana Pagadora",
  "+51900000011": "Beto Cobrador",
  "+51900000012": "Saúl Saldo",
  "+51900000013": "Paola Pendiente",
  "+51900000014": "Raúl Rechazado",
};

export function findSeedFullName(phone: string): string | null {
  return SEED_FULL_NAMES[phone] ?? null;
}
