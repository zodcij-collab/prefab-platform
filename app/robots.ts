import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/portal/", "/login"] },
    sitemap: "https://www.prefab.lv/sitemap.xml",
  };
}
