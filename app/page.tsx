import Image from "next/image";
import { PlayOnline } from "@/components/landing/play-online";
import hero from "@/components/landing/hero.webp";
import styles from "@/components/landing/landing.module.css";

export default function Home() {
  return (
    <main className={styles.landing}>
      <Image src={hero} alt="" fill preload placeholder="blur" sizes="100vw" className={styles.hero} />
      <div className={styles.shade} />
      <section className={styles.content}>
        <p className={styles.kicker}>
          <img src="/world/brands/base.png" alt="" width={20} height={20} /> Built on Base
        </p>
        <h1>BASE WORLD</h1>
        <p className={styles.tagline}>Quests, agents, and DeFi — on Base.</p>
        {/* Full page loads on purpose: each mode boots the game store with its own save and chain. */}
        <div className={styles.modes}>
          <a href="/offline" className={styles.mode}>
            <b>Play offline</b>
            <span>No sign-in. Local save. Simulated.</span>
          </a>
          <PlayOnline />
        </div>
      </section>
    </main>
  );
}
