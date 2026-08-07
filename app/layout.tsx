import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.prefab.lv"),
  title: { default: "PREFAB.LV | Saliekamo konstrukciju montāža", template: "%s | PREFAB.LV" },
  description:
    "Saliekamo dzelzsbetona konstrukciju montāža, betona darbi un metāla konstrukciju montāža Latvijā un Eiropā.",
  openGraph: {
    title: "PREFAB.LV",
    description: "Precizitāte saliekamajā būvniecībā.",
    type: "website",
    locale: "lv_LV",
    url: "/",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="lv">
      <body>{children}</body>
    </html>
  );
}
