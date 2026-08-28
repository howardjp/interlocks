import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const port="4310"; const base=`http://127.0.0.1:${port}`; const directory=await mkdtemp(join(tmpdir(),"interlocks-http-")); let stderr="";
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-H","127.0.0.1","-p",port],{cwd:process.cwd(),env:{...process.env,INTERLOCKS_ENV:"development",INTERLOCKS_DEMO_MODE:"true",INTERLOCKS_DB_PATH:join(directory,"interlocks.db"),INTERLOCKS_DOCUMENT_PATH:join(directory,"documents")},stdio:["ignore","ignore","pipe"]});
server.stderr.on("data",(chunk)=>{stderr+=chunk.toString();});
const headers=(account="acct-alex",workspace="ws-northstar")=>({"content-type":"application/json","x-interlocks-account":account,"x-interlocks-workspace":workspace});
async function waitUntilReady(){for(let attempt=0;attempt<80;attempt+=1){try{if((await fetch(`${base}/api/health`)).ok)return;}catch{}await new Promise((resolve)=>setTimeout(resolve,100));}throw new Error(`Production server did not become ready. ${stderr}`);}
async function request(path,options={}){const response=await fetch(base+path,options);if(!response.ok)throw new Error(`${path}: ${response.status} ${await response.text()}`);return response;}
async function json(path,options={}){return (await request(path,options)).json();}
async function command(name,input={},resourceId=null,account="acct-alex",workspace="ws-northstar"){return json("/api/commands",{method:"POST",headers:headers(account,workspace),body:JSON.stringify({command:name,input,resourceId,workspaceId:workspace})});}

try{
  await waitUntilReady();
  const html=await request("/"); assert.match(await html.text(),/Interlocks/); assert.equal(html.headers.get("x-frame-options"),"DENY"); assert.match(html.headers.get("content-security-policy"),/frame-ancestors 'none'/);
  const health=await json("/api/health"); assert.equal(health.status,"ok"); assert.equal(health.schemaVersion,4);
  let snapshot=await json("/api/snapshot?workspace=ws-northstar",{headers:headers()}); assert.equal(snapshot.cases.length,5); assert.ok(snapshot.cases.every((item)=>!("score" in item))); assert.deepEqual(new Set(snapshot.cases.map((item)=>item.workflowState)),new Set(["RED","YELLOW","GREEN"]));
  const denied=await fetch(`${base}/api/snapshot?workspace=ws-blue-ridge`,{headers:headers("acct-daniel","ws-blue-ridge")}); assert.equal(denied.status,403);
  const check=(await command("check.create",{matterId:"m-aster",participatingPersonIds:["p-jordan"],subjects:[{name:"Meridian AI",role:"PROSPECTIVE_CLIENT"},{name:"Solaris Dynamics",role:"RELATED_PARTY"},{name:"123 Main Street",role:"PROPERTY"}]})).result; assert.equal(check.workflowState,"YELLOW"); assert.ok(check.hits.some((item)=>item.matchConfidence==="EXACT")); assert.ok(check.hits.some((item)=>item.matchConfidence==="RELATED")); assert.ok(check.hits.every((item)=>item.explanation.statement.includes("no legal conclusion")));
  const disclosure=(await command("disclosure.create",{personId:"p-jordan",matterId:"m-northstar",entityId:"o-civic",relationshipType:"OUTSIDE_EMPLOYMENT",description:"Paid advisory work overlaps the active hiring panel.",disclosureClass:"PORTABLE"})).result;
  await command("case.action",{type:"note",body:"Outside engagement letter received and reviewed."},disclosure.id);
  await command("case.action",{type:"determination",disposition:"CLEARED",rationale:"Proceed only after documented recusal and access removal.",ruleBasis:"Firm policy COI-4",jurisdiction:"District of Columbia",controlDescription:"Remove Jordan from the panel and revoke candidate-packet access.",ownerPersonId:"p-alex",dueAt:"2026-09-15"},disclosure.id);
  snapshot=await json("/api/snapshot?workspace=ws-northstar",{headers:headers()}); const created=snapshot.cases.find((item)=>item.id===disclosure.id); assert.equal(created.humanDisposition,"CLEARED"); assert.notEqual(created.workflowState,"GREEN"); const control=snapshot.controls.find((item)=>item.caseId===disclosure.id); assert.ok(control); await command("control.complete",{},control.id);
  await command("consent.create",{affectedEntityId:"o-easton",status:"OBTAINED",consentType:"INFORMED_CONSENT",evidenceRequirement:"CONFIRMED_IN_WRITING",scope:"Helios consortium representation"},"c-0039");
  await command("screen.create",{screenedPersonId:"p-maya",effectiveAt:"2026-08-28T12:00:00Z",restrictions:"No matter access or participation",feeRestrictions:"No fee allocation",noticeRequirements:"Written notice to affected client",status:"ACTIVE"},"c-0041");
  const associated=(await command("associated.request",{subjectPersonId:"p-maya",associatedEntityId:"o-meridian-holdings",queryEntityId:"o-meridian",question:"Is there a current connection relevant to this review?",disclosureScope:"Connection state plus limited role description"})).result; await command("associated.respond",{response:"KNOWN_CONNECTION",permittedDetail:"Current board role"},associated.id);
  snapshot=await json("/api/snapshot?workspace=ws-northstar",{headers:headers()}); assert.ok(snapshot.notes.some((item)=>item.caseId===disclosure.id)); assert.equal(snapshot.associatedResponses.some((item)=>item.requestId===associated.id),true); assert.ok(snapshot.audit.some((item)=>item.action==="associated_person.responded"));
  const workspaceExport=await request("/api/export?kind=workspace&workspace=ws-northstar",{headers:headers()}); assert.match(workspaceExport.headers.get("content-type"),/application\/json/); const personal=await json("/api/export?kind=personal",{headers:headers("acct-jordan")}); assert.equal(personal.schema,"interlocks.personal-ledger.v1"); const checkExport=await json(`/api/export?kind=check&resourceId=${check.id}&workspace=ws-northstar`,{headers:headers()}); assert.equal(checkExport.schema,"interlocks.conflict-check.v1");
  const admin=await json("/api/admin",{headers:headers()}); assert.equal(admin.workspaces.length,2); assert.ok(admin.accounts.length>=7);
  await command("demo.reset"); assert.equal((await json("/api/snapshot?workspace=ws-northstar",{headers:headers()})).cases.length,5);
  console.log("HTTP MVP workflow passed: security, tenancy, check, disclosure, judgment, consent, screen, associated person, exports, admin, and reset.");
}finally{server.kill("SIGTERM");await new Promise((resolve)=>server.once("exit",resolve));await rm(directory,{recursive:true,force:true});}
