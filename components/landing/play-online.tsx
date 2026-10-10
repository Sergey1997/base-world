"use client";

import { useLogin, usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { ENTER, PRIVY_ID } from "@/components/online/privy";
import styles from "./landing.module.css";

export function PlayOnline() {
  const card = (
    <>
      <b>Play online</b>
      <span>Sign in. Shared world. Real txs.</span>
    </>
  );
  if (!PRIVY_ID) {
    return (
      <a href="/online" className={styles.mode} data-primary>
        {card}
      </a>
    );
  }
  return <Go>{card}</Go>;
}

function Go({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();
  const going = useRef(false);
  const enter = () => {
    if (going.current) return;
    going.current = true;
    sessionStorage.setItem(ENTER, "1");
    router.push("/online");
  };
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
