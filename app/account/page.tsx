import type { Metadata } from "next";
import { AccountClient } from "@/components/online/client";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

export default function Account() {
  return <AccountClient />;
}
