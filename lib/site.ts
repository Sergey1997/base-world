export const SITE = {
  name: "Base World",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://base-world-omega.vercel.app",
  title: "Base World — a 3D open world on Base",
  description:
    "Play Base World, a stylized 3D open world for the Base ecosystem. Explore protocol districts, complete quests, talk to AI agents, and run real DeFi — or play offline with a local save.",
  locale: "en_US",
} as const;
