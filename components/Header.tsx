"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Container } from "@/components/ui/Container";
import type { PublicLanguage } from "@/data/public-site";

type NavCopy={company:string;approach:string;services:string;why:string;projects:string;mission:string;contact:string;portal:string;menu:string;languages:string};
export function Header({language,copy}:{language:PublicLanguage;copy:NavCopy}){const[isOpen,setIsOpen]=useState(false);const navigation=[[copy.company,"#company"],[copy.approach,"#approach"],[copy.services,"#services"],[copy.why,"#why-precast"],[copy.projects,"#projects"],[copy.mission,"#mission"],[copy.contact,"#contact"]] as const;return <header className="site-header"><Container className="header-inner">
  <Link className="brand" href={`/?lang=${language}`} aria-label="PREFAB.LV"><Image src="/brand/prefab-logo.png" width={240} height={116} alt="PREFAB.LV" priority/></Link>
  <button className="menu-button" type="button" aria-expanded={isOpen} aria-controls="primary-navigation" onClick={()=>setIsOpen((current)=>!current)}><span className="sr-only">{copy.menu}</span><span/><span/></button>
  <nav id="primary-navigation" className={`navigation ${isOpen?"open":""}`}>{navigation.map(([label,href])=><a key={href} href={href} onClick={()=>setIsOpen(false)}>{label}</a>)}<Link className="login-link" href="/login">{copy.portal}</Link><div className="languages" aria-label={copy.languages}>{(["lv","en","ru"] as const).map((item)=><Link className={item===language?"active":""} aria-current={item===language?"page":undefined} href={`/?lang=${item}`} key={item}>{item.toUpperCase()}</Link>)}</div></nav>
</Container></header>}
