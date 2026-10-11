import Image from "next/image";
import { Mark } from "@/components/brand/mark";
import { PlayOnline } from "@/components/landing/play-online";
import hero from "@/components/landing/hero.webp";
import styles from "@/components/landing/landing.module.css";
import { SITE } from "@/lib/site";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "VideoGame",
  name: SITE.name,
  url: SITE.url,
  description: SITE.description,
  applicationCategory: "Game",
  operatingSystem: "Web browser",
  gamePlatform: "Web browser",
  genre: ["Adventure", "Simulation"],
  inLanguage: "en",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export default function Home() {
  return (
    <main className={styles.landing}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Image src={hero} alt="" fill preload placeholder="blur" sizes="100vw" className={styles.hero} />
      <div className={styles.shade} />
      <section className={styles.content}>
        <Mark className={styles.mark} size={56} />
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
