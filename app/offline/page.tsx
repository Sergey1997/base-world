import type { Metadata } from "next";
import { WorldClient } from "@/components/world/client";

export const metadata: Metadata = { title: "Base World · Offline" };

export default function Offline() {
  return <WorldClient />;
}
