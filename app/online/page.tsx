import type { Metadata } from "next";
import { OnlineClient } from "@/components/online/client";

export const metadata: Metadata = {
  title: "Play online",
  description: "Play Base World online — one shared world, Privy login, and real Base transactions.",
  alternates: { canonical: "/online" },
};

export default function Online() {
  return <OnlineClient />;
}
