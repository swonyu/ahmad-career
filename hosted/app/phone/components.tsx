"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Bookmark, Check, FileText, X } from "lucide-react";
import { countryCodes, friendlyDate, linkedInURL, profileEssentials, stageNames, stages, type ApplicationRecord, type Job, type Plan, type Profile } from "./model";

export function Modal({ title, children, onClose, busy = false, notice, checkingIdentity = false, onCheckIdentity }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean; notice?: { text: string; error?: boolean } | null; checkingIdentity?: boolean; onCheckIdentity?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const recheck = useRef<HTMLButtonElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  useEffect(() => { if (checkingIdentity) recheck.current?.focus(); }, [checkingIdentity]);
  return <dialog className="phone-dialog" ref={dialog} onCancel={event => { event.preventDefault(); if (!busy && !checkingIdentity) onClose(); }} aria-labelledby="phone-dialog-title">
    <div className="phone-dialog-head"><h2 id="phone-dialog-title">{checkingIdentity ? "Confirming your account" : title}</h2><button type="button" className="icon-button" aria-label="Close dialog" disabled={busy || checkingIdentity} onClick={onClose}><X aria-hidden="true" size={22} /></button></div>
    {checkingIdentity && <div className="phone-warning" role="status"><p>Your unfinished form is kept here. Confirm this account before viewing or changing its private details.</p><button className="button secondary full" ref={recheck} disabled={busy} onClick={onCheckIdentity}>Check account again</button></div>}
    {notice && !checkingIdentity && <div className={`phone-notice ${notice.error ? "is-error" : ""}`} role={notice.error ? "alert" : "status"}><p>{notice.text}</p></div>}
    {busy && <p className="phone-note" role="status">Working… Your changes are being checked.</p>}
    <fieldset hidden={checkingIdentity} disabled={busy || checkingIdentity}>{children}</fieldset>
  </dialog>;
}

export function Readiness({ profile }: { profile: Profile }) {
  const ready = profileEssentials(profile);
  return <ul className="phone-readiness" aria-label="Application essentials">{([ ["name", "Name"], ["email", "Email"], ["resume", "PDF CV"] ] as const).map(([key,label]) => <li key={key} className={ready[key] ? "is-ready" : "needs-detail"}>{ready[key] ? <Check size={15} aria-hidden="true" /> : <span className="readiness-dot" aria-hidden="true" />}<span>{label}<span className="visually-hidden">{ready[key] ? ": ready" : ": needed"}</span></span></li>)}</ul>;
}

export function JobCard({ job, saved, onSave, onDetails, busy = false }: { job: Job; saved: boolean; onSave?: () => void; onDetails?: () => void; busy?: boolean }) {
  return <article className="phone-job-card">
    <div className="phone-job-top"><span className="company-avatar" aria-hidden="true">{Array.from(job.company.trim())[0]?.toUpperCase() || "•"}</span><div><p className="phone-company"><bdi>{job.company}</bdi></p><h3>{onDetails ? <button className="job-title-button" onClick={onDetails}>{job.title}</button> : job.title}</h3></div>{onSave && <button className={`icon-button bookmark ${saved ? "is-saved" : ""}`} aria-label={saved ? `${job.title} is saved` : `Save ${job.title}`} aria-pressed={saved} disabled={busy || saved} onClick={onSave}><Bookmark size={21} fill={saved ? "currentColor" : "none"} aria-hidden="true" /></button>}</div>
    {job.location && <p className="phone-job-location"><bdi>{job.location}</bdi></p>}{job.checkedAt && <p className="phone-note">Posting checked <time dateTime={job.checkedAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(job.checkedAt))}</time></p>}
    {job.summary && <p className="phone-job-summary">{job.summary}</p>}
    <div className="phone-job-footer">{job.sourceName && <span>{job.sourceName}</span>}<a href={job.url} target="_blank" rel="noopener noreferrer">View job <ArrowUpRight size={16} aria-hidden="true" /></a></div>
  </article>;
}

export function ProfileEditor({ profile, onChange, onPDF, onSaveLocal, onSaveOnline, accountEmail, hasWorkspace, busy, changed }: {
  profile: Profile; onChange: (value: Partial<Profile>) => void; onPDF: (file: File) => Promise<void>; onSaveLocal: () => void; onSaveOnline: () => void;
  accountEmail?: string; hasWorkspace: boolean; busy: boolean; changed: boolean;
}) {
  const countries = useMemo(() => { const names = new Intl.DisplayNames(["en"], { type: "region" }); return countryCodes.map(code => ({ code, name: names.of(code) || code })).sort((a,b) => a.name.localeCompare(b.name, "en")); }, []);
  const fileInput = useRef<HTMLInputElement>(null);
  const validLinkedIn = useMemo(() => { try { return profile.linkedin ? linkedInURL(profile.linkedin) : ""; } catch { return ""; } }, [profile.linkedin]);
  return <div className="phone-profile-form">
    <section className="phone-card"><div className="section-label"><span>01</span><h2>Your essentials</h2></div><Readiness profile={profile} />
      <p className="phone-note">Start with a name, email, and CV. You can save an unfinished draft on this phone.</p>
      <div className="phone-field-pair"><label>First or single name<input autoComplete="given-name" maxLength={150} value={profile.firstName} onChange={e => onChange({ firstName: e.target.value })} /></label><label>Last name <span className="optional">optional</span><input autoComplete="family-name" maxLength={150} value={profile.lastName} onChange={e => onChange({ lastName: e.target.value })} /></label></div>
      <label>Email address<input type="email" autoComplete="email" inputMode="email" maxLength={254} value={profile.email} onChange={e => onChange({ email: e.target.value })} /></label>
      {accountEmail && profile.email.trim().toLowerCase() !== accountEmail.toLowerCase() && <div className="phone-inline-note"><p>Auto Apply uses your connected account email.</p><button className="text-button" onClick={() => onChange({ email: accountEmail })}>Use {accountEmail}</button></div>}
      <div className="phone-cv"><FileText aria-hidden="true" size={28} /><div><strong>{profile.resume?.name || "Choose your PDF CV"}</strong><span>{profile.resume ? `${(profile.resume.size / 1024).toFixed(0)} KB · PDF` : "PDF only · up to 5 MiB"}</span></div></div>
      <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="visually-hidden" tabIndex={-1} aria-label="Choose PDF CV" onChange={e => { const file = e.target.files?.[0]; if (file) void onPDF(file); e.currentTarget.value = ""; }} />
      <div className="phone-actions"><button className="button secondary" disabled={busy} onClick={() => fileInput.current?.click()}>{profile.resume ? "Change PDF" : "Choose PDF"}</button>{profile.resume && <button className="text-button danger-text" disabled={busy} onClick={() => onChange({ resume: null })}>Remove from profile</button>}</div>
    </section>
    <section className="phone-card"><div className="section-label"><span>02</span><h2>Your professional links</h2></div>
      <label>LinkedIn profile <span className="optional">optional</span><input type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="https://www.linkedin.com/in/your-name" maxLength={2048} value={profile.linkedin} onChange={e => onChange({ linkedin: e.target.value })} /></label>
      <p className="phone-note">A saved link doesn’t connect or verify your LinkedIn account. You will see the exact link before an application is sent.</p>
      {validLinkedIn && <a className="phone-external" href={validLinkedIn} target="_blank" rel="noopener noreferrer">Open LinkedIn profile <ArrowUpRight size={16} aria-hidden="true" /></a>}
      <label>Portfolio or website <span className="optional">optional</span><input type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="https://example.com" maxLength={2048} value={profile.website} onChange={e => onChange({ website: e.target.value })} /></label>
    </section>
    <details className="phone-card phone-disclosure"><summary>More profile details <span>Optional</span></summary>
      <label>Phone number<input type="tel" autoComplete="tel" maxLength={150} value={profile.phone} onChange={e => onChange({ phone: e.target.value })} /></label>
      <div className="phone-field-pair"><label>City<input autoComplete="address-level2" maxLength={150} value={profile.city} onChange={e => onChange({ city: e.target.value })} /></label><label>Country or region<select value={profile.country} onChange={e => onChange({ country: e.target.value })}><option value="">Choose a country</option>{countries.map(c => <option value={c.code} key={c.code}>{c.name}</option>)}</select></label></div>
      <label>Professional headline<textarea rows={2} maxLength={500} value={profile.headline} onChange={e => onChange({ headline: e.target.value })} placeholder="Your work and the strengths you bring" /></label>
      <label>Skills <span className="optional">up to 30, separated by commas</span><input maxLength={3000} value={profile.skills.join(",")} onChange={e => onChange({ skills: e.target.value.split(",") })} /></label>
      <label>Experience level<select value={profile.experienceLevel} onChange={e => onChange({ experienceLevel: e.target.value as Profile["experienceLevel"] })}><option value="any">Any level</option><option value="entry">Entry level</option><option value="mid">Mid level</option><option value="senior">Senior level</option></select></label>
    </details>
    <div className="phone-save-area"><p className="phone-note">{changed ? "You have unsaved changes in this form." : "Your saved profile is shown above."} Saving on this phone does not upload your CV.</p><button className={`button ${hasWorkspace ? "secondary" : "primary"} full`} disabled={busy} onClick={onSaveLocal}>Save on this phone</button>{hasWorkspace && <button className="button primary full" disabled={busy} onClick={onSaveOnline}>Save profile online</button>}</div>
  </div>;
}

export function RecordEditor({ record, onSave, onCancel, onDirtyChange, busy }: { record: ApplicationRecord; onSave: (draft: ApplicationRecord, clearApplied: boolean) => void; onCancel: () => void; onDirtyChange: (changed: boolean) => void; busy: boolean }) {
  const [draft, setDraft] = useState(record), [confirmClear, setConfirmClear] = useState(false);
  const changed = JSON.stringify(draft) !== JSON.stringify(record);
  useEffect(() => { onDirtyChange(changed); }, [changed, onDirtyChange]);
  const edit = (value: Partial<ApplicationRecord>) => { setDraft(previous => ({ ...previous, ...value })); setConfirmClear(false); };
  return <form onSubmit={event => { event.preventDefault(); if (record.appliedElsewhere && draft.stage === "saved" && !confirmClear) setConfirmClear(true); else onSave(draft, confirmClear); }}>
    <p className="phone-note">Your record on this phone. It does not change the employer’s records or create a verified receipt.</p>
    <label>Stage<select value={draft.stage} onChange={e => edit({ stage: e.target.value as ApplicationRecord["stage"] })}>{stages.map(stage => <option key={stage} value={stage}>{stageNames[stage]}</option>)}</select></label>
    <div className="phone-field-pair"><label>Applied date <span className="optional">optional</span><input type="date" min="1900-01-01" max="9999-12-31" value={draft.appliedDate} onChange={e => edit({ appliedDate: e.target.value })} /></label><label>Follow-up date <span className="optional">optional</span><input type="date" min="1900-01-01" max="9999-12-31" value={draft.followUpDate} onChange={e => edit({ followUpDate: e.target.value })} /></label></div>
    <label>Private notes<textarea maxLength={5000} rows={5} value={draft.note} placeholder="People to contact, interview details, or your next step" onChange={e => edit({ note: e.target.value })} /></label>
    {confirmClear && <div className="phone-warning" role="alert"><h3>Mark as not applied?</h3><p>This removes your own applied mark and allows a new application review. It does not withdraw an application from an employer.</p><button type="button" className="button secondary full" onClick={() => { setConfirmClear(false); setDraft(previous => ({ ...previous, stage: record.stage })); }}>Keep application record</button></div>}
    <div className="phone-dialog-actions"><button type="button" className="button secondary" disabled={busy} onClick={onCancel}>Cancel</button><button type="submit" className="button primary" disabled={busy}>{confirmClear ? "Mark not applied" : "Save record"}</button></div>
  </form>;
}

export function ReviewDetails({ plan }: { plan: Plan }) {
  return <div className="phone-review-items">{plan.items.map(item => <article className="phone-card" key={item.jobId}><p className="phone-kicker">{item.state === "ready" ? "Ready for your review" : item.state.replaceAll("_", " ")}</p><h3>{item.title}</h3><p className="phone-company">{item.company}</p>{item.reason && <p className="phone-inline-note">{item.reason}</p>}<dl className="phone-review-data"><dt>Employer job page</dt><dd><a href={item.job.url} target="_blank" rel="noopener noreferrer">{item.job.url}</a></dd><dt>Name</dt><dd>{item.payloadSummary.name || "Not provided"}</dd><dt>Email</dt><dd>{item.payloadSummary.email || "Not provided"}</dd>{item.payloadSummary.phone && <><dt>Phone</dt><dd>{item.payloadSummary.phone}</dd></>}{item.payloadSummary.website && <><dt>Portfolio</dt><dd>{item.payloadSummary.website}</dd></>}{item.payloadSummary.linkedin && <><dt>LinkedIn profile</dt><dd>{item.payloadSummary.linkedin}</dd></>}<dt>CV</dt><dd>{item.resume?.name || "No PDF selected"}</dd><dt>Additional information</dt><dd className="preserve-lines">{item.payloadSummary.comments || "None"}</dd>{item.payloadSummary.consentStore !== undefined && <><dt>Employer data-processing consent</dt><dd>{item.payloadSummary.consentStore ? "Yes" : "No"}</dd></>}{item.payloadSummary.consentMarketing !== undefined && <><dt>Future contact permission</dt><dd>{item.payloadSummary.consentMarketing ? "Yes" : "No"}</dd></>}</dl>{item.privacyPolicyUrl && <a href={item.privacyPolicyUrl} target="_blank" rel="noopener noreferrer">Employer privacy policy</a>}</article>)}</div>;
}

export function RecordSummary({ record }: { record?: ApplicationRecord }) {
  if (!record) return null;
  return <div className="phone-record-summary"><span className="phone-stage">{stageNames[record.stage]}</span>{record.appliedElsewhere && <span>You marked this as applied</span>}{record.followUpDate && <span>Follow up <bdi>{friendlyDate(record.followUpDate)}</bdi></span>}</div>;
}
