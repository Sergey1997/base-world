"use client";

import { useLogin, usePrivy } from "@privy-io/react-auth";
import { useEffect } from "react";
import { ENTER, PRIVY_ID, Privy } from "@/components/online/privy";
import styles from "./landing.module.css";

const home = () => (typeof window === "undefined" ? undefined : `${window.location.origin}/`);

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
    <Privy afterOAuth={home()}>
      <Go>{card}</Go>
    </Privy>
  );
}

function enter() {
  sessionStorage.setItem(ENTER, "1");
  location.assign("/online");
}

function Go({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = usePrivy();
  const { login } = useLogin({
    onComplete: () => {
      if (sessionStorage.getItem(ENTER)) enter();
    },
  });
  useEffect(() => {
    if (ready && authenticated && sessionStorage.getItem(ENTER)) enter();
  }, [ready, authenticated]);
  return (
    <button
      type="button"
      className={styles.mode}
      data-primary
      disabled={!ready}
      onClick={() => {
        sessionStorage.setItem(ENTER, "1");
        if (authenticated) enter();
        else login();
      }}
    >
      {children}
    </button>
  );
}
