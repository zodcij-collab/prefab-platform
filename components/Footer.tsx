import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { company,socialLinks,whatsappNumber } from "@/data/site";
import { publicCopy,type PublicLanguage } from "@/data/public-site";

type FooterCopy={summary:string;contacts:string;follow:string;coming:string;navigation:string;privacy:string;portal:string};
function secureUrl(value:string){try{const url=new URL(value);return url.protocol==="https:"?url.toString():"";}catch{return"";}}
export function Footer({language,copy}:{language:PublicLanguage;copy:FooterCopy}){const links=[...socialLinks.map((item)=>({name:item.name,url:secureUrl(item.url)})),{name:"WhatsApp",url:whatsappNumber?`https://wa.me/${whatsappNumber}`:""}].filter((item)=>item.url);const nav=publicCopy[language].nav;return <footer className="footer"><Container><div className="footer-topline"/><div className="footer-grid">
  <div><div className="footer-brand">PREFAB<span>.LV</span></div><p>{copy.summary}</p></div>
  <div><h3>{copy.contacts}</h3><a href={`mailto:${company.email}`}>{company.email}</a><a href={company.website} target="_blank" rel="noopener noreferrer">www.prefab.lv</a><span>{company.address}</span></div>
  <div className="footer-socials"><h3>{copy.follow}</h3>{links.length?links.map((social)=><a href={social.url} target="_blank" rel="noopener noreferrer" key={social.name}><span>{social.name}</span></a>):<span className="footer-social-disabled">{copy.coming}</span>}</div>
  <div><h3>{copy.navigation}</h3><a href="#company">{nav.company}</a><a href="#projects">{nav.projects}</a><a href="#contact">{nav.contact}</a><Link href="/login">{copy.portal}</Link></div>
  </div><div className="footer-bottom"><span>© 2026 {company.name}</span><span>Reg. No. {company.registrationNumber}</span></div></Container></footer>}
