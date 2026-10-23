import {
  biometricProfileResponseSchema,
  biometricSessionResponseSchema,
  type BiometricSessionInput,
} from "@wallet/contracts/biometric";
import { getJson, postJson } from "../../lib/apiClient";

export function fetchBiometricProfile(documentNumber: string) {
  return getJson(
    `/biometric/profiles/${encodeURIComponent(documentNumber)}`,
    biometricProfileResponseSchema,
  );
}

export function enterWithBiometrics(input: BiometricSessionInput) {
  return postJson("/biometric/sessions", input, biometricSessionResponseSchema);
}
