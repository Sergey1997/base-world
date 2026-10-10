import Image from "next/image";
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
        <p className={styles.tagline}>An open world for the Base ecosystem. Fly between Aerodrome, Virtuals, Morpho, Uniswap, Aave and Bankr, take on quests and meet the agents.</p>
        {/* Full page loads on purpose: each mode boots the game store with its own save and chain. */}
        <div className={styles.modes}>
          <a href="/offline" className={styles.mode}>
            <b>Play offline</b>
            <span>Jump straight in. No account, progress stays in this browser, every transaction is simulated.</span>
          </a>
          <a href="/online" className={styles.mode} data-primary>
            <b>Play online</b>
            <span>Sign in with X, Google, email or a wallet. One shared world, cloud saves, real Base transactions from your wallet.</span>
          </a>
        </div>
      </section>
    </main>
  );
}
