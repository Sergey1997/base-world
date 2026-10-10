"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { PRIVY_ID, Privy } from "@/components/online/privy";
import styles from "./landing.module.css";

export function PlayOnline() {
  const card = (
    <>
      <b>Play online</b>
      <span>Sign in with X, Google, email or a wallet. One shared world, cloud saves, real Base transactions from your wallet.</span>
    </>
  );
  if (!PRIVY_ID) {
    return (
      <a href="/online" className={styles.mode} data-primary>
        {card}
      </a>
    );
  }
  return (
    <Privy>
      <Go>{card}</Go>
    </Privy>
  );
}

function Go({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login } = usePrivy();
  const [enter, setEnter] = useState(false);
  useEffect(() => {
    if (enter && authenticated) location.assign("/online");
  }, [enter, authenticated]);
  return (
    <button
      type="button"
      className={styles.mode}
      data-primary
      disabled={!ready}
      onClick={() => {
        if (authenticated) location.assign("/online");
        else {
          setEnter(true);
          login();
        }
      }}
    >
      {children}
    </button>
  );
}
