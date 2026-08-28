"use client";

/* The supplied namespaced SVG is intentionally served as an unmodified image. */
/* eslint-disable @next/next/no-img-element */

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

export default function AcceptInvitationPage() {
  const params=useParams<{token:string}>(); const router=useRouter(); const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  const accept=async()=>{setBusy(true);setError("");try{const response=await fetch("/api/commands",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({command:"invitation.accept",input:{token:params.token}})});const body=await response.json();if(!response.ok)throw new Error(body.error||"Unable to accept invitation");router.replace("/");}catch(caught){setError(caught instanceof Error?caught.message:"Unable to accept invitation");setBusy(false);}};
  return <main className="invitation-screen"><img src="/interlocks-icon.svg" alt="Interlocks"/><section className="card"><p>Workspace invitation</p><h1>Join the conflict boundary</h1><span>Your Account and Person remain distinct. Accepting creates an active membership in the inviting workspace.</span>{error?<p className="form-error">{error}</p>:null}<button className="primary-button" disabled={busy} onClick={()=>void accept()}>{busy?"Accepting…":"Accept invitation"}</button></section></main>;
}
