import { createAuthClient } from "better-auth/react";

// Better Auth 1.7 registers generic OAuth providers as social providers, so the
// standard `signIn.social` client API covers them without a client plugin.
export const authClient = createAuthClient();
export const { signIn, signOut, useSession, changePassword } = authClient;
