"use client";

import { PRIVY_ID, Privy } from "@/components/online/privy";

/** One Privy session for landing, /online and /account — remounting it after login crashes the tab. */
export function Providers({ children }: { children: React.ReactNode }) {
  return PRIVY_ID ? <Privy>{children}</Privy> : children;
}
