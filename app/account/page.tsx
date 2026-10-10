import type { Metadata } from "next";
import { AccountClient } from "@/components/online/client";

export const metadata: Metadata = { title: "Base World · Account" };

export default function Account() {
  return <AccountClient />;
}
