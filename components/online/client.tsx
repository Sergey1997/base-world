"use client";

import dynamic from "next/dynamic";
import { Loader } from "@/components/world/loader";

/** Privy, the wallet stack and the 3D world all need a browser; none of it is server-rendered. */
export const OnlineClient = dynamic(() => import("./online"), {
  ssr: false,
  loading: () => <Loader />,
});

export const AccountClient = dynamic(() => import("./account"), {
  ssr: false,
  loading: () => <Loader />,
});
