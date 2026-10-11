import type { Metadata, Viewport } from "next";
import { SITE } from "@/lib/site";
import { Providers } from "./providers";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: SITE.title, template: "%s · Base World" },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: ["Base World", "Base", "Base blockchain", "onchain game", "DeFi", "Aerodrome", "3D open world"],
  authors: [{ name: "Base World" }],
  creator: "Base World",
  category: "games",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: SITE.locale,
    url: SITE.url,
    siteName: SITE.name,
    title: SITE.title,
    description: SITE.description,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.title,
    description: SITE.description,
  },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: "#0052ff",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body style={{ margin: 0, background: "#050b24", color: "#dce8ff", fontFamily: "system-ui, sans-serif" }} suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
