"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { base } from "viem/chains";

export const PRIVY_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
export const ENTER = "bw-enter";

export function Privy({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={PRIVY_ID}
      config={{
        appearance: { theme: "#070e2c", accentColor: "#0052ff", logo: "/icon.png", landingHeader: "Enter Base World", walletChainType: "ethereum-only" },
        loginMethods: ["twitter", "google", "email", "wallet"],
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        defaultChain: base,
        supportedChains: [base],
        // After X, land back in the world — not a fresh /account page that tears the session down.
        customOAuthRedirectUrl: typeof window === "undefined" ? undefined : `${window.location.origin}/online#settings`,
      }}
    >
      {children}
    </PrivyProvider>
  );
}
