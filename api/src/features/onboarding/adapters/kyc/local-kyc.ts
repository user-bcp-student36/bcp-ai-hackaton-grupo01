import type { KycVerifier } from "../../application/ports.js";
import type { KycStatus } from "../../domain/identity.js";

// Returns only the configured outcome: the request never influences the result.
export class LocalKyc implements KycVerifier {
  constructor(private readonly configuredStatus: KycStatus) {}

  verify(): Promise<{ kycStatus: KycStatus; simulated: true }> {
    return Promise.resolve({
      kycStatus: this.configuredStatus,
      simulated: true,
    });
  }
}
