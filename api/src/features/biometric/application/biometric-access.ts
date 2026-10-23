import type { User } from "../../onboarding/domain/identity.js";
import type { LoginResult } from "../../auth/application/login-user.js";
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
    fullName?: string;
    password: string;
  }) => Promise<User>;
  open: (user: User) => LoginResult;
  newPassword: () => string;
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
// No password is ever asked: a new account gets a random one nobody knows.
export function enterWithBiometrics(
  deps: Dependencies,
): (input: {
  documentNumber: string;
}) => Promise<LoginResult & { created: boolean }> {
  return async ({ documentNumber }) => {
    const profile = findDemoProfile(documentNumber);
    if (!profile) throw new BiometricNotEnabled();
    const identity = { documentType: "DNI" as const, documentNumber };
    const existing = deps.users.findByDocument(identity);
    if (existing) {
      return { ...deps.open(existing.user), created: false };
    }
    const user = await deps.register({
      ...identity,
      phone: profile.phone,
      email: profile.email,
      fullName: profile.fullName,
      password: deps.newPassword(),
    });
    return { ...deps.open(user), created: true };
  };
}
