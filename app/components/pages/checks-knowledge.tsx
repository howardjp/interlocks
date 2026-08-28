"use client";

import { FormEvent, useMemo, useState } from "react";
import { Icon } from "../icons";
import { Empty, formatDate, Modal, Pill, SectionHeading, SubmitButton, TrafficLight, titleCase } from "../primitives";
import type { AuthorityStatus, Command, PolicyFactDefinition, PolicyPack, Snapshot } from "../types";

type DraftAuthority = AuthorityStatus|"";
type DraftQuestion = {
  id:number;
  text:string;
  authorities:Record<string,DraftAuthority>;
  facts:Record<string,boolean|string|number|undefined>;
};

function useAction() {
  const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  const run=async(work:()=>Promise<unknown>)=>{setBusy(true);setError("");try{return await work();}catch(caught){setError(caught instanceof Error?caught.message:"Unable to save");return undefined;}finally{setBusy(false);}};
  return {busy,error,run};
}

function initialAuthorities(packs:PolicyPack[]) {
  return Object.fromEntries(packs.map((pack)=>[pack.id,pack.id==="aba-model"?"POTENTIALLY_APPLICABLE":""])) as Record<string,DraftAuthority>;
}

function draftQuestion(id:number,packs:PolicyPack[]):DraftQuestion {
  return { id,text:"What conflicts should be cleared before this matter proceeds?",authorities:initialAuthorities(packs),facts:{} };
}

function factDefinitions(packs:PolicyPack[],authorities:Record<string,DraftAuthority>) {
  const definitions=new Map<string,PolicyFactDefinition>();
  for(const pack of packs){if(!authorities[pack.id])continue;const items=Array.isArray(pack.manifest.factDefinitions)?pack.manifest.factDefinitions as PolicyFactDefinition[]:[];for(const item of items)if(item.id!=="tribunal")definitions.set(item.id,item);}
  return [...definitions.values()];
}

function packManifest(pack:PolicyPack) {
  return pack.manifest as { factDefinitions?:unknown[]; rules?:unknown[]; validationStatus?:string; coverageScope?:string };
}

function FactInput({definition,value,onChange}:{definition:PolicyFactDefinition;value:boolean|string|number|undefined;onChange:(value:boolean|string|number|undefined)=>void}) {
  if(definition.type==="BOOLEAN")return <label><span>{definition.label}</span><select value={value===true?"YES":value===false?"NO":""} onChange={(event)=>onChange(event.target.value==="YES"?true:event.target.value==="NO"?false:undefined)}><option value="">Unknown / not answered</option><option value="YES">Yes</option><option value="NO">No</option></select>{definition.description?<small>{definition.description}</small>:null}</label>;
  if(definition.type==="ENUM")return <label><span>{definition.label}</span><select value={String(value??"")} onChange={(event)=>onChange(event.target.value||undefined)}><option value="">Unknown / not answered</option>{definition.options?.map((option)=><option value={option.value} key={option.value}>{option.label}</option>)}</select>{definition.description?<small>{definition.description}</small>:null}</label>;
  return <label><span>{definition.label}</span><input type={definition.type==="NUMBER"?"number":"text"} value={String(value??"")} onChange={(event)=>onChange(event.target.value===""?undefined:definition.type==="NUMBER"?Number(event.target.value):event.target.value)}/></label>;
}

function AuthorityMatrix({packs,question,onChange}:{packs:PolicyPack[];question:DraftQuestion;onChange:(next:DraftQuestion)=>void}) {
  const definitions=useMemo(()=>factDefinitions(packs,question.authorities),[packs,question.authorities]);
  const groups=useMemo(()=>{const result=new Map<string,PolicyFactDefinition[]>();for(const definition of definitions)result.set(definition.group,[...(result.get(definition.group)||[]),definition]);return result;},[definitions]);
  return <div className="authority-editor">
    <div className="authority-head"><span>Authority</span><span>Application to this question</span></div>
    {packs.map((pack)=><label className="authority-row" key={pack.id}>
      <span><strong>{pack.shortTitle||pack.title}</strong><small>{titleCase(pack.authorityType)} · {pack.version}</small></span>
      <select aria-label={`${pack.title} authority status`} value={question.authorities[pack.id]||""} onChange={(event)=>{const status=event.target.value as DraftAuthority;const authorities={...question.authorities,[pack.id]:status};if(pack.id!=="aba-model"&&status==="CONTROLLING"&&authorities["aba-model"]==="POTENTIALLY_APPLICABLE")authorities["aba-model"]="COMPARATIVE_ONLY";onChange({...question,authorities});}}>
        <option value="">Not selected</option>
        <option value="CONTROLLING" disabled={pack.id==="aba-model"}>Controlling</option>
        <option value="POTENTIALLY_APPLICABLE">Potentially applicable</option>
        <option value="COMPARATIVE_ONLY">Comparative only</option>
      </select>
    </label>)}
    <fieldset className="clearance-facts"><legend>Conflict-clearance facts</legend><p>Open only the sections implicated by this question. Unanswered trigger facts do not manufacture a conflict; unanswered requirements remain visible once a trigger is established.</p>{[...groups.entries()].map(([group,items],index)=><details key={group} open={index===0}><summary><strong>{group}</strong><span>{items.length} facts</span></summary><div className="clearance-fact-grid">{items.map((definition)=><FactInput key={definition.id} definition={definition} value={question.facts[definition.id]} onChange={(value)=>onChange({...question,facts:{...question.facts,[definition.id]:value}})}/>)}</div></details>)}</fieldset>
  </div>;
}

export function ChecksPage({data,command}:{data:Snapshot;command:Command}) {
  const [open,setOpen]=useState(false); const [selected,setSelected]=useState<string|null>(data.checks[0]?.id||null); const [questions,setQuestions]=useState<DraftQuestion[]>(()=>[draftQuestion(1,data.policyPacks)]); const action=useAction();
  const check=data.checks.find((item)=>item.id===selected);
  const hits=useMemo(()=>data.hits.filter((item)=>item.conflictCheckId===selected),[data.hits,selected]);
  const policyQuestions=useMemo(()=>data.policyQuestions.filter((item)=>item.conflictCheckId===selected),[data.policyQuestions,selected]);
  const questionIds=useMemo(()=>new Set(policyQuestions.map((item)=>item.id)),[policyQuestions]);
  const evaluations=useMemo(()=>data.policyEvaluations.filter((item)=>questionIds.has(item.questionId)),[data.policyEvaluations,questionIds]);
  const evaluationIds=useMemo(()=>new Set(evaluations.map((item)=>item.id)),[evaluations]);
  const findings=useMemo(()=>data.policyRuleResults.filter((item)=>evaluationIds.has(item.evaluationId)&&item.outcome!=="NOT_MATCHED"),[data.policyRuleResults,evaluationIds]);
  const selectionByEvaluation=useMemo(()=>new Map(evaluations.map((evaluation)=>[evaluation.id,data.policySelections.find((selection)=>selection.id===evaluation.authoritySelectionId)])),[data.policySelections,evaluations]);

  const updateQuestion=(id:number,next:DraftQuestion)=>setQuestions((current)=>current.map((item)=>item.id===id?next:item));
  const openDialog=()=>{setQuestions([draftQuestion(Date.now(),data.policyPacks)]);setOpen(true);};
  const submit=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault(); const values=Object.fromEntries(new FormData(event.currentTarget)); const entity=data.entities.find((item)=>item.id===values.subjectEntityId);
    void action.run(async()=>{
      if(!entity)throw new Error("Choose a subject");
      const result=await command("check.create",{
        matterId:values.matterId,
        subjects:[{entityId:entity.id,name:entity.canonicalName,role:values.subjectRole}],
        questions:questions.map((item,index)=>{
          const context=Object.fromEntries(Object.entries(item.facts).filter(([,value])=>value!==undefined));
          return { key:`question-${index+1}`,text:item.text,context,authorities:Object.entries(item.authorities).filter(([,status])=>status).map(([packId,status])=>({packId,status})) };
        }),
      }) as {id:string};
      setSelected(result.id);setOpen(false);
    });
  };

  return <>
    <div className="split-layout">
      <article className="card panel"><SectionHeading eyebrow="Deterministic + policy analysis" title="Conflict checks" action={<button className="primary-button" onClick={openDialog}><Icon name="plus"/>New check</button>}/><div className="record-list">{data.checks.map((item)=><button key={item.id} className={`record ${selected===item.id?"selected":""}`} onClick={()=>setSelected(item.id)}><TrafficLight state={item.workflowState} compact/><div className="record-main"><div><strong>{item.reference}</strong>{item.reReviewSuggested?<Pill tone="yellow">Re-review</Pill>:null}</div><p>{item.hitCount} entity hit{item.hitCount===1?"":"s"} · {item.policyFindingCount} policy finding{item.policyFindingCount===1?"":"s"}</p><footer><span>{item.policyQuestionCount} question{item.policyQuestionCount===1?"":"s"}</span><span>Corpus {item.corpusRevision}</span><span>{formatDate(item.executedAt,true)}</span></footer></div><Icon name="arrow"/></button>)}</div>{!data.checks.length?<Empty title="No checks yet" message="Run proposed parties through the recorded corpus and selected legal authorities."/>:null}</article>
      <article className="card panel"><SectionHeading eyebrow={check?.reference||"Result evidence"} title="Why Interlocks surfaced it"/>
        {hits.map((hit)=><div className="hit-card" key={hit.id}><header><TrafficLight state={hit.workflowState} compact/><Pill tone={hit.matchConfidence==="EXACT"?"red":"yellow"}>{hit.matchConfidence}</Pill><span>{hit.matchedEntityName}</span></header><p>{hit.explanation.statement}</p><ul>{hit.explanation.reasons.map((reason)=><li key={reason}>{reason}</li>)}</ul><footer><span>{titleCase(hit.sourceResourceType)}</span><code>{hit.sourceResourceId}</code></footer></div>)}
        {policyQuestions.map((questionItem)=>{
          const questionEvaluations=evaluations.filter((item)=>item.questionId===questionItem.id); const questionFindings=findings.filter((item)=>questionEvaluations.some((evaluation)=>evaluation.id===item.evaluationId));
          return <section className="policy-question-result" key={questionItem.id}><header><div><Pill tone="blue">POLICY QUESTION</Pill><strong>{questionItem.questionText}</strong></div><span>{questionFindings.length} finding{questionFindings.length===1?"":"s"}</span></header>{questionFindings.map((finding)=>{const selection=selectionByEvaluation.get(finding.evaluationId);return <div className={`policy-finding ${finding.outcome.toLowerCase()}`} key={finding.id}><div><Pill tone={finding.outcome==="MATCHED"?"yellow":"blue"}>{finding.outcome}</Pill><Pill>{selection?titleCase(selection.authorityStatus):"Authority"}</Pill></div><strong>{finding.findingMessage}</strong><p><a href={finding.sourceUrl} target="_blank" rel="noreferrer">{finding.citation}</a> · {finding.packVersion}</p>{finding.comparisonNote?<small>{finding.comparisonNote}</small>:null}{finding.unknownQuestions.map((unknown)=><span className="unknown-question" key={unknown.fact}>{unknown.prompt}</span>)}</div>})}{!questionFindings.length?<p className="policy-clear">The selected packs produced no matched or indeterminate rules for this question.</p>:null}</section>;
        })}
        {!hits.length&&!policyQuestions.length?<Empty title="No surfaced connections" message="The recorded corpus produced no deterministic or policy result for this check."/>:null}
      </article>
    </div>
    {open?<Modal title="Run a conflict and policy check" eyebrow="Question-level legal analysis" onClose={()=>setOpen(false)} wide><form className="modal-form policy-check-form" onSubmit={submit}><div className="form-grid"><label><span>Matter</span><select name="matterId" required>{data.matters.map((item)=><option value={item.id} key={item.id}>{item.code} — {item.title}</option>)}</select></label><label><span>Proposed subject</span><select name="subjectEntityId" required>{data.entities.map((entity)=><option value={entity.id} key={entity.id}>{entity.canonicalName}</option>)}</select></label></div><label><span>Subject&apos;s role in this analysis</span><select name="subjectRole" defaultValue="ADVERSE_PARTY"><option>ADVERSE_PARTY</option><option>OPPOSING_PARTY</option><option>CLIENT</option><option>PROSPECTIVE_CLIENT</option><option>FORMER_CLIENT</option><option>RELATED_PARTY</option><option>OTHER</option></select></label>
      <div className="question-editors">{questions.map((item,index)=><section className="question-editor" key={item.id}><header><div><Pill tone="blue">Question {index+1}</Pill><strong>Choose authority independently</strong></div>{questions.length>1?<button type="button" className="text-button danger" onClick={()=>setQuestions((current)=>current.filter((candidate)=>candidate.id!==item.id))}>Remove</button>:null}</header><label><span>Question</span><textarea rows={2} required value={item.text} onChange={(event)=>updateQuestion(item.id,{...item,text:event.target.value})}/></label><AuthorityMatrix packs={data.policyPacks} question={item} onChange={(next)=>updateQuestion(item.id,next)}/></section>)}</div>
      <button type="button" className="secondary-button add-question" disabled={questions.length>=12} onClick={()=>setQuestions((current)=>[...current,draftQuestion(Date.now()+current.length,data.policyPacks)])}><Icon name="plus"/>Add another policy question</button><p className="model-note"><Icon name="shield"/>Interlocks applies versioned packs to a frozen fact snapshot. Results are review signals with exact citations—not machine-made legal conclusions. ABA remains available for provisional screening and comparison.</p>{action.error?<p className="form-error" role="alert">{action.error}</p>:null}<footer><button type="button" className="secondary-button" onClick={()=>setOpen(false)}>Cancel</button><SubmitButton busy={action.busy} label="Run analysis" busyLabel="Evaluating…"/></footer></form></Modal>:null}
  </>;
}

export function KnowledgePage({data,command}:{data:Snapshot;command:Command}) {
  const [mode,setMode]=useState<"assertion"|"inference"|"document"|null>(null); const action=useAction();
  const submit=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const form=event.currentTarget;const activeMode=mode;if(!activeMode)return;void action.run(async()=>{const values=Object.fromEntries(new FormData(form));if(activeMode==="document"){const file=(form.elements.namedItem("file") as HTMLInputElement).files?.[0];if(!file)throw new Error("Choose a file");values.filename=file.name;values.mediaType=file.type||"application/octet-stream";values.bytesBase64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(reader.error);reader.onload=()=>resolve(String(reader.result).split(",")[1]);reader.readAsDataURL(file);});delete values.file;}await command(activeMode==="document"?"document.upload":`${activeMode}.create`,values);setMode(null);});};
  return <>
    <article className="card panel policy-catalog"><SectionHeading eyebrow="Jurisdictional Policy Engine" title="Installed legal authority packs"/><p className="page-intro">Every evaluation records the pack version, source, fact hash, rule trace, and authority status used at that moment. These packs cover conflict clearance only and remain visibly marked for substantive legal review.</p><div className="policy-pack-grid">{data.policyPacks.map((pack)=>{const manifest=packManifest(pack);return <a href={pack.sourceUrl} target="_blank" rel="noreferrer" className="policy-pack" key={`${pack.id}-${pack.version}`}><span><Icon name="shield"/></span><div><header><strong>{pack.shortTitle||pack.title}</strong><Pill tone={pack.authorityType==="MODEL"?"blue":pack.authorityType==="TRIBUNAL"?"yellow":"green"}>{titleCase(pack.authorityType)}</Pill></header><p>{pack.description}</p><div className="pack-assurance"><Pill tone="yellow">Review validation pending</Pill><span>{manifest.rules?.length||0} clearance checks</span><span>{manifest.factDefinitions?.length||0} typed facts</span></div><footer><span>{pack.version}</span><span>Effective {formatDate(pack.effectiveFrom)}</span><code>{pack.contentHash.slice(0,10)}…</code></footer></div></a>;})}</div></article>
    <div className="knowledge-grid"><article className="card panel"><SectionHeading eyebrow="Recorded fact" title="Assertions" action={<button className="secondary-button" onClick={()=>setMode("assertion")}><Icon name="plus"/>Assert</button>}/><div className="dense-list">{data.assertions.map((item)=><div key={item.id}><Pill tone="green">ASSERTION</Pill><strong>{titleCase(item.predicate)}</strong><p>{item.objectText||item.objectId}</p><span>{item.provenance||"Direct entry"} · {formatDate(item.recordedAt,true)}</span></div>)}</div></article><article className="card panel"><SectionHeading eyebrow="System conclusion" title="Inferences" action={<button className="secondary-button" onClick={()=>setMode("inference")}><Icon name="plus"/>Infer</button>}/><div className="dense-list">{data.inferences.map((item)=><div key={item.id} className={item.superseded?"superseded":""}><Pill tone="yellow">INFERENCE</Pill><strong>{item.conclusion}</strong><p>{item.evidenceSummary}</p><span>Corpus {item.corpusRevision}{item.matchConfidence?` · ${item.matchConfidence}`:""}</span></div>)}</div></article><article className="card panel span-two"><SectionHeading eyebrow="Immutable source material" title="Documents and evidence" action={<button className="primary-button" onClick={()=>setMode("document")}><Icon name="upload"/>Upload</button>}/><div className="document-grid">{data.documents.map((item)=><div className="document-card" key={item.id}><span><Icon name="file"/></span><div><strong>{item.filename}</strong><p>{item.description||item.mediaType}</p><footer><code>{item.sha256.slice(0,12)}…</code><span>{item.attachmentCount} attachments · {item.evidenceLinkCount} evidence links</span></footer></div></div>)}</div>{!data.documents.length?<Empty title="No documents" message="Upload source material and attach it to resources or evidence records."/>:null}</article></div>
    {mode?<Modal title={mode==="document"?"Upload immutable document":mode==="assertion"?"Record an assertion":"Record an inference"} eyebrow={mode==="inference"?"System conclusion":"Evidence corpus"} onClose={()=>setMode(null)}><form className="modal-form" onSubmit={submit}>{mode==="document"?<><label><span>File</span><input name="file" type="file" required/></label><label><span>Description</span><input name="description"/></label><label><span>Confidentiality</span><select name="confidentialityScope"><option>WORKSPACE</option><option>RESTRICTED</option><option>PERSONAL</option></select></label></>:<>{mode==="assertion"?<><div className="form-grid"><label><span>Subject type</span><select name="subjectType"><option>ENTITY</option><option>PERSON</option><option>MATTER</option></select></label><label><span>Subject</span><select name="subjectId">{data.entities.map((entity)=><option value={entity.id} key={entity.id}>{entity.canonicalName}</option>)}</select></label></div><label><span>Predicate</span><input name="predicate" required placeholder="is affiliated with"/></label><label><span>Object or value</span><input name="objectText" required/></label><label><span>Provenance</span><input name="provenance" required placeholder="Source and observation method"/></label></>:<><div className="form-grid"><label><span>Subject type</span><select name="subjectType"><option>ENTITY</option><option>PERSON</option><option>MATTER</option></select></label><label><span>Subject</span><select name="subjectId">{data.entities.map((entity)=><option value={entity.id} key={entity.id}>{entity.canonicalName}</option>)}</select></label></div><label><span>Inference type</span><input name="inferenceType" required/></label><label><span>Conclusion</span><textarea name="conclusion" required rows={3}/></label><label><span>Evidence summary</span><textarea name="evidenceSummary" required rows={3}/></label><label><span>Match confidence</span><select name="matchConfidence"><option value="">Not applicable</option><option>EXACT</option><option>STRONG</option><option>POSSIBLE</option><option>RELATED</option></select></label></>}</>}{action.error?<p className="form-error">{action.error}</p>:null}<footer><button type="button" className="secondary-button" onClick={()=>setMode(null)}>Cancel</button><SubmitButton busy={action.busy} label="Save record"/></footer></form></Modal>:null}
  </>;
}
