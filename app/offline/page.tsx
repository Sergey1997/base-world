import type { Metadata } from "next";
import { WorldClient } from "@/components/world/client";

export const metadata: Metadata = {
  title: "Play offline",
  description: "Play Base World offline — no sign-in, local save, every onchain action simulated.",
  alternates: { canonical: "/offline" },
};

export default function Offline() {
  return <WorldClient />;
}
