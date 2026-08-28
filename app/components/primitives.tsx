"use client";

import { ReactNode } from "react";
import { Icon } from "./icons";
import type { WorkflowState } from "./types";

export function formatDate(value:string|null, withTime=false) { if (!value) return "—"; return new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",...(withTime?{hour:"numeric",minute:"2-digit"}:{})}).format(new Date(value)); }
export function initials(name:string|null) { return String(name || "?").split(" ").filter(Boolean).slice(0,2).map((part)=>part[0]).join(""); }
export function titleCase(value:string) { return value.toLowerCase().replaceAll("_"," ").replace(/\b\w/g,(letter)=>letter.toUpperCase()); }

export function TrafficLight({state,compact=false}:{state:WorkflowState;compact?:boolean}) {
  const copy = {GREEN:"No unresolved issue surfaced",YELLOW:"Human review required",RED:"Do not proceed"}[state];
  return <span className={`traffic traffic-${state.toLowerCase()} ${compact?"compact":""}`} title={copy}><i/>{compact?state:copy}</span>;
}

export function Pill({children,tone="neutral"}:{children:ReactNode;tone?:string}) { return <span className={`pill tone-${tone}`}>{children}</span>; }
export function Avatar({name}:{name:string|null}) { return <span className="avatar">{initials(name)}</span>; }

export function Empty({title,message}:{title:string;message:string}) { return <div className="empty"><span><Icon name="search"/></span><h3>{title}</h3><p>{message}</p></div>; }

export function Modal({title,eyebrow,children,onClose,wide=false}:{title:string;eyebrow?:string;children:ReactNode;onClose:()=>void;wide?:boolean}) {
  return <div className="modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><section className={`modal ${wide?"wide":""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><div>{eyebrow?<p>{eyebrow}</p>:null}<h2 id="modal-title">{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><Icon name="close"/></button></header>{children}</section></div>;
}

export function SectionHeading({eyebrow,title,action}:{eyebrow:string;title:string;action?:ReactNode}) { return <div className="section-heading"><div><p>{eyebrow}</p><h2>{title}</h2></div>{action}</div>; }

export function SubmitButton({busy,label,busyLabel="Saving…"}:{busy:boolean;label:string;busyLabel?:string}) { return <button className="primary-button" disabled={busy}>{busy?busyLabel:<>{label}<Icon name="arrow" size={15}/></>}</button>; }
