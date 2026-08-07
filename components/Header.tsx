"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Container } from "@/components/ui/Container";

const navigation = [
  ["Uzņēmums", "#company"],
  ["Pakalpojumi", "#services"],
  ["Kāpēc prefab", "#why-precast"],
  ["Projekti", "#projects"],
  ["Karjera", "#careers"],
  ["Kontakti", "#contact"],
] as const;

export function Header() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="site-header">
      <Container className="header-inner">
        <Link className="brand" href="/" aria-label="PREFAB.LV sākumlapa">
          <Image src="/brand/prefab-logo.png" width={190} height={92} alt="PREFAB.LV" priority />
        </Link>

        <button
          className="menu-button"
          type="button"
          aria-expanded={isOpen}
          aria-controls="primary-navigation"
          onClick={() => setIsOpen((current) => !current)}
        >
          <span className="sr-only">Atvērt izvēlni</span>
          <span />
          <span />
        </button>

        <nav id="primary-navigation" className={`navigation ${isOpen ? "open" : ""}`}>
          {navigation.map(([label, href]) => (
            <a key={href} href={href} onClick={() => setIsOpen(false)}>{label}</a>
          ))}
          <Link className="login-link" href="/login">Portāls</Link>
          <div className="languages" aria-label="Valodas">
            <button className="active" type="button">LV</button>
            <button type="button">RU</button>
            <button type="button">EN</button>
          </div>
        </nav>
      </Container>
    </header>
  );
}
