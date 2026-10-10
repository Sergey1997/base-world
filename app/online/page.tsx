import type { Metadata } from "next";
import { OnlineClient } from "@/components/online/client";

export const metadata: Metadata = { title: "Base World · Online" };

export default function Online() {
  return <OnlineClient />;
}
