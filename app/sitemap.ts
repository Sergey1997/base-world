import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return ["", "/offline", "/online"].map((path) => ({
    url: `${SITE.url}${path || "/"}`,
    lastModified,
    changeFrequency: path ? "weekly" : "daily",
    priority: path ? 0.8 : 1,
  }));
}
