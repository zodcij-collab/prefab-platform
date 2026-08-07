"use client";

import { useActionState,useState } from "react";
import { useFormStatus } from "react-dom";
import { submitContactAction,type ContactState } from "@/app/contact-actions";

type Copy={name:string;company:string;email:string;phone:string;location:string;message:string;consent:string;submit:string;sending:string;notConfigured:string;invalid:string;spam:string;sent:string};
const initial:ContactState={status:"idle",code:""};
function Submit({copy}:{copy:Copy}){const{pending}=useFormStatus();return <button className="button button-primary" type="submit" disabled={pending}><span>{pending?copy.sending:copy.submit}</span><span>↗</span></button>}

export function ContactForm({copy}:{copy:Copy}){const[state,action]=useActionState(submitContactAction,initial);const[startedAt]=useState(()=>Date.now());const feedback=state.code?copy[state.code]:"";return <form className="contact-form" action={action}>
  <input type="hidden" name="startedAt" value={startedAt}/><label className="contact-honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off"/></label>
  <div className="contact-form-grid"><label>{copy.name}<input name="name" type="text" maxLength={120} autoComplete="name" required/></label><label>{copy.company}<input name="company" type="text" maxLength={160} autoComplete="organization"/></label><label>{copy.email}<input name="email" type="email" maxLength={254} autoComplete="email" required/></label><label>{copy.phone}<input name="phone" type="tel" maxLength={60} autoComplete="tel"/></label></div>
  <label>{copy.location}<input name="location" type="text" maxLength={200} required/></label><label>{copy.message}<textarea name="message" rows={5} maxLength={3000} required/></label>
  <label className="contact-consent"><input name="consent" type="checkbox" required/><span>{copy.consent}</span></label>
  <Submit copy={copy}/>{feedback&&<p className={state.status==="success"?"contact-success":"contact-error"} role={state.status==="success"?"status":"alert"}>{feedback}</p>}
</form>}
