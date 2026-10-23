import type { User } from "../../onboarding/domain/identity.js";
import type { LoginInput, LoginResult } from "../../auth/application/login-user.js";
import type { UserLookup } from "../../auth/application/ports.js";
import {
  BiometricNotEnabled,
  findDemoProfile,
  type DemoProfile,
} from "../domain/demo-profiles.js";

type Dependencies = {
  users: UserLookup;
  register: (input: {
    documentType: "DNI";
    documentNumber: string;
    phone: string;
    email: string;
    password: string;
  }) => Promise<User>;
  login: (input: LoginInput) => Promise<LoginResult>;
};

export type BiometricProfile = DemoProfile & { hasAccount: boolean };

export function getBiometricProfile(
  deps: Pick<Dependencies, "users">,
): (documentNumber: string) => BiometricProfile {
  return (documentNumber) => {
    const profile = findDemoProfile(documentNumber);
    if (!profile) throw new BiometricNotEnabled();
    const existing = deps.users.findByDocument({
      documentType: "DNI",
      documentNumber,
    });
    return { ...profile, hasAccount: existing !== null };
  };
}

// The face frame is only checked for shape upstream: the match itself is simulated.
export function enterWithBiometrics(
  deps: Dependencies,
): (input: {
  documentNumber: string;
  password: string;
}) => Promise<LoginResult & { created: boolean }> {
  return async ({ documentNumber, password }) => {
    const profile = findDemoProfile(documentNumber);
    if (!profile) throw new BiometricNotEnabled();
    const identity = { documentType: "DNI" as const, documentNumber };
    const created = deps.users.findByDocument(identity) === null;
    if (created) {
      await deps.register({
        ...identity,
        phone: profile.phone,
        email: profile.email,
        password,
      });
    }
    const session = await deps.login({ ...identity, password });
    return { ...session, created };
  };
}
