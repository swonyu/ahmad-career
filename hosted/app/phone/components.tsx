"use client";
import { useI18n } from "../i18n/LocaleProvider";
import { formatDateTime, formatNumber } from "../i18n/core";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Bookmark, Check, FileText, X } from "lucide-react";
import { countryCodes, friendlyDate, linkedInURL, profileEssentials, stageNames, stages, type ApplicationRecord, type Job, type Plan, type Profile } from "./model";

export function Modal({ title, children, onClose, busy = false, notice, checkingIdentity = false, onCheckIdentity }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean; notice?: { text: string; error?: boolean } | null; checkingIdentity?: boolean; onCheckIdentity?: () => void }) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const recheck = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  useEffect(() => { if (checkingIdentity) recheck.current?.focus(); }, [checkingIdentity]);
  return <dialog className="phone-dialog" ref={dialog} onCancel={event => { event.preventDefault(); if (!busy && !checkingIdentity) onClose(); }} aria-labelledby="phone-dialog-title">
    <div className="phone-dialog-head"><h2 id="phone-dialog-title" dir="auto">{checkingIdentity ? t("Confirming your account") : title}</h2><button type="button" className="icon-button" aria-label={t("Close dialog")} disabled={busy || checkingIdentity} onClick={onClose}><X aria-hidden="true" size={22} /></button></div>
    {checkingIdentity && <div className="phone-warning" role="status"><p>{t("Your unfinished form is kept here. Confirm this account before viewing or changing its private details.")}</p>{notice?.error && <p role="alert">{t(notice.text)}</p>}<button className="button secondary full" ref={recheck} disabled={busy} onClick={onCheckIdentity}>{t("Check account again")}</button></div>}
    {notice && !checkingIdentity && <div className={`phone-notice ${notice.error ? "is-error" : ""}`} role={notice.error ? "alert" : "status"}><p>{t(notice.text)}</p></div>}
    {busy && <p className="phone-note" role="status">{t("Working… Your changes are being checked.")}</p>}
    <fieldset hidden={checkingIdentity} disabled={busy || checkingIdentity}>{children}</fieldset>
  </dialog>;
}

export function Readiness({ profile }: { profile: Profile }) {
  const { t } = useI18n();
  const ready = profileEssentials(profile);
  return <ul className="phone-readiness" aria-label={t("Application essentials")}>{([ ["name", "Name"], ["email", "Email"], ["resume", "PDF CV"] ] as const).map(([key,label]) => <li key={key} className={ready[key] ? "is-ready" : "needs-detail"}>{ready[key] ? <Check size={15} aria-hidden="true" /> : <span className="readiness-dot" aria-hidden="true" />}<span>{t(label)}<span className="visually-hidden">{ready[key] ? t(": ready") : t(": needed")}</span></span></li>)}</ul>;
}

export function JobCard({ job, saved, onSave, onDetails, busy = false }: { job: Job; saved: boolean; onSave?: () => void; onDetails?: () => void; busy?: boolean }) {
  const { t, language } = useI18n();
  return <article className="phone-job-card">
    <div className="phone-job-top"><span className="company-avatar" aria-hidden="true">{Array.from(job.company.trim())[0]?.toUpperCase() || "•"}</span><div><p className="phone-company"><bdi>{job.company}</bdi></p><h3 dir="auto">{onDetails ? <button className="job-title-button" onClick={onDetails}>{job.title}</button> : job.title}</h3></div>{onSave && <button className={`icon-button bookmark ${saved ? "is-saved" : ""}`} aria-label={saved ? t("{0} is saved", [job.title]) : t("Save {0}", [job.title])} aria-pressed={saved} disabled={busy || saved} onClick={onSave}><Bookmark size={21} fill={saved ? "currentColor" : "none"} aria-hidden="true" /></button>}</div>
    {job.location && <p className="phone-job-location"><bdi>{job.location}</bdi></p>}{job.checkedAt && <p className="phone-note">{t("Posting checked ")}<time dateTime={job.checkedAt}>{formatDateTime(job.checkedAt, language)}</time></p>}
    {job.summary && <p className="phone-job-summary" dir="auto">{job.summary}</p>}
    <div className="phone-job-footer">{job.sourceName && <span>{job.sourceName}</span>}<a href={job.url} target="_blank" rel="noopener noreferrer">{t("View job ")}<ArrowUpRight size={16} aria-hidden="true" /></a></div>
  </article>;
}

export function ProfileEditor({ profile, onChange, onPDF, onSaveLocal, onSaveOnline, accountEmail, hasWorkspace, busy, changed }: {
  profile: Profile; onChange: (value: Partial<Profile>) => void; onPDF: (file: File) => Promise<void>; onSaveLocal: () => void; onSaveOnline: () => void;
  accountEmail?: string; hasWorkspace: boolean; busy: boolean; changed: boolean;
}) {
  const { t, language } = useI18n();
  const countries = useMemo(() => { const names = new Intl.DisplayNames([language], { type: "region" }); return countryCodes.map(code => ({ code, name: names.of(code) || code })).sort((a,b) => a.name.localeCompare(b.name, language)); }, [language]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [targetCountry, setTargetCountry] = useState("");
  const validLinkedIn = useMemo(() => { try { return profile.linkedin ? linkedInURL(profile.linkedin) : ""; } catch { return ""; } }, [profile.linkedin]);
  return <div className="phone-profile-form">
    <section className="phone-card"><div className="section-label"><span>01</span><h2>{t("Your essentials")}</h2></div><Readiness profile={profile} />
      <p className="phone-note">{t("Start with a name, email, and CV. You can save an unfinished draft on this phone.")}</p>
      <div className="phone-field-pair"><label>{t("First or single name")}<input dir="auto" autoComplete="given-name" maxLength={150} value={profile.firstName} onChange={e => onChange({ firstName: e.target.value })} /></label><label>{t("Last name ")}<span className="optional">{t("optional")}</span><input dir="auto" autoComplete="family-name" maxLength={150} value={profile.lastName} onChange={e => onChange({ lastName: e.target.value })} /></label></div>
      <label>{t("Email address")}<input type="email" dir="ltr" autoComplete="email" inputMode="email" maxLength={254} value={profile.email} onChange={e => onChange({ email: e.target.value })} /></label>
      {accountEmail && profile.email.trim().toLowerCase() !== accountEmail.toLowerCase() && <div className="phone-inline-note"><p>{t("Auto Apply uses your connected account email.")}</p><button className="text-button" onClick={() => onChange({ email: accountEmail })}>{t("Use ")}<bdi>{accountEmail}</bdi></button></div>}
      <div className="phone-cv"><FileText aria-hidden="true" size={28} /><div><strong dir="auto">{profile.resume?.name || t("Choose your PDF CV")}</strong><span>{profile.resume ? t("{0} KB · PDF", [formatNumber(profile.resume.size / 1024, language, { maximumFractionDigits: 0 })]) : t("PDF only · up to 5 MiB")}</span></div></div>
      <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="visually-hidden" tabIndex={-1} aria-label={t("Choose PDF CV")} onChange={e => { const file = e.target.files?.[0]; if (file) void onPDF(file); e.currentTarget.value = ""; }} />
      <div className="phone-actions"><button className="button secondary" disabled={busy} onClick={() => fileInput.current?.click()}>{profile.resume ? t("Change PDF") : t("Choose PDF")}</button>{profile.resume && <button className="text-button danger-text" disabled={busy} onClick={() => onChange({ resume: null })}>{t("Remove from profile")}</button>}</div>
    </section>
    <section className="phone-card"><div className="section-label"><span>02</span><h2>{t("Your professional links")}</h2></div>
      <label>{t("LinkedIn profile ")}<span className="optional">{t("optional")}</span><input type="url" dir="ltr" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="https://www.linkedin.com/in/your-name" maxLength={2048} value={profile.linkedin} onChange={e => onChange({ linkedin: e.target.value })} /></label>
      <p className="phone-note">{t("A saved link doesn’t connect or verify your LinkedIn account. You will see the exact link before an application is sent.")}</p>
      {validLinkedIn && <a className="phone-external" href={validLinkedIn} target="_blank" rel="noopener noreferrer">{t("Open LinkedIn profile ")}<ArrowUpRight size={16} aria-hidden="true" /></a>}
      <label>{t("Portfolio or website ")}<span className="optional">{t("optional")}</span><input type="url" dir="ltr" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="https://example.com" maxLength={2048} value={profile.website} onChange={e => onChange({ website: e.target.value })} /></label>
    </section>
    <section className="phone-card"><div className="section-label"><span>03</span><h2>{t("Your career preferences")}</h2></div><p className="phone-note">{t("Choose what suits you. These preferences stay blank until you add them.")}</p>
      <label>{t("Target roles ")}<span className="optional">{t("up to 30, one per line")}</span><textarea dir="auto" rows={3} maxLength={3029} value={profile.targetRoles.join("\n")} onChange={e => onChange({ targetRoles: e.target.value ? e.target.value.split("\n") : [] })} /></label>
      <label>{t("Target country or region")}<select value={targetCountry} onChange={e => setTargetCountry(e.target.value)}><option value="">{t("Choose a country to add")}</option>{countries.filter(country => !profile.targetCountries.includes(country.code)).map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label>
      <button type="button" className="button secondary" disabled={busy || !targetCountry || profile.targetCountries.length >= 30} onClick={() => { if (targetCountry && !profile.targetCountries.includes(targetCountry)) onChange({ targetCountries: [...profile.targetCountries, targetCountry] }); setTargetCountry(""); }}>{t("Add target country")}</button>
      {profile.targetCountries.length > 0 && <ul className="phone-preference-list" aria-label={t("Selected target countries")}>{profile.targetCountries.map(code => <li key={code}><span>{countries.find(country => country.code === code)?.name ?? code}</span><button type="button" className="icon-button" disabled={busy} aria-label={t("Remove {0} from target countries", [countries.find(country => country.code === code)?.name ?? code])} onClick={() => onChange({ targetCountries: profile.targetCountries.filter(value => value !== code) })}><X size={17} aria-hidden="true" /></button></li>)}</ul>}
      <fieldset className="phone-choice-group"><legend>{t("Work preferences ")}<span className="optional">{t("choose any that suit you")}</span></legend>{([{ value: "on-site", label: "On site" }, { value: "hybrid", label: "Hybrid" }, { value: "remote", label: "Remote" }] as const).map(mode => <label className="phone-check" key={mode.value}><input type="checkbox" checked={profile.workModes.includes(mode.value)} onChange={event => onChange({ workModes: event.target.checked ? [...profile.workModes, mode.value] : profile.workModes.filter(value => value !== mode.value) })} /><span>{t(mode.label)}</span></label>)}</fieldset>
    </section>
    <details className="phone-card phone-disclosure"><summary>{t("More profile details ")}<span>{t("Optional")}</span></summary>
      <label>{t("Phone number")}<input type="tel" dir="ltr" autoComplete="tel" maxLength={150} value={profile.phone} onChange={e => onChange({ phone: e.target.value })} /></label>
      <div className="phone-field-pair"><label>{t("City")}<input dir="auto" autoComplete="address-level2" maxLength={150} value={profile.city} onChange={e => onChange({ city: e.target.value })} /></label><label>{t("Country or region")}<select value={profile.country} onChange={e => onChange({ country: e.target.value })}><option value="">{t("Choose a country")}</option>{countries.map(c => <option value={c.code} key={c.code}>{c.name}</option>)}</select></label></div>
      <label>{t("Professional headline")}<textarea dir="auto" rows={2} maxLength={500} value={profile.headline} onChange={e => onChange({ headline: e.target.value })} placeholder={t("Your work and the strengths you bring")} /></label>
      <label>{t("Skills ")}<span className="optional">{t("up to 30, separated by commas")}</span><input dir="auto" maxLength={3000} value={profile.skills.join(",")} onChange={e => onChange({ skills: e.target.value.split(/[,،]/) })} /></label>
      <label>{t("Experience level")}<select value={profile.experienceLevel} onChange={e => onChange({ experienceLevel: e.target.value as Profile["experienceLevel"] })}><option value="any">{t("Any level")}</option><option value="entry">{t("Entry level")}</option><option value="mid">{t("Mid level")}</option><option value="senior">{t("Senior level")}</option></select></label>
    </details>
    <div className="phone-save-area"><p className="phone-note">{changed ? t("You have unsaved changes in this form.") : t("Your saved profile is shown above.")} {t(" Saving on this phone does not upload your CV.")}</p><button className={`button ${hasWorkspace ? "secondary" : "primary"} full`} disabled={busy} onClick={onSaveLocal}>{t("Save on this phone")}</button>{hasWorkspace && <button className="button primary full" disabled={busy} onClick={onSaveOnline}>{t("Save profile online")}</button>}</div>
  </div>;
}

export function RecordEditor({ record, initialDraft, onDraftChange, onSave, onCancel, onDirtyChange, busy }: { record: ApplicationRecord; initialDraft?: ApplicationRecord; onDraftChange: (draft: ApplicationRecord) => void; onSave: (draft: ApplicationRecord, clearApplied: boolean) => void; onCancel: () => void; onDirtyChange: (changed: boolean) => void; busy: boolean }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(initialDraft ?? record), [confirmClear, setConfirmClear] = useState(false);
  const changed = JSON.stringify(draft) !== JSON.stringify(record);
  useEffect(() => { onDirtyChange(changed); }, [changed, onDirtyChange]);
  const edit = (value: Partial<ApplicationRecord>) => { const next = { ...draft, ...value }; setDraft(next); onDraftChange(next); setConfirmClear(false); };
  return <form onSubmit={event => { event.preventDefault(); if (record.appliedElsewhere && draft.stage === "saved" && !confirmClear) setConfirmClear(true); else onSave(draft, confirmClear); }}>
    <p className="phone-note">{t("Your record on this phone. It does not change the employer’s records or create a verified receipt.")}</p>
    <label>{t("Stage")}<select value={draft.stage} onChange={e => edit({ stage: e.target.value as ApplicationRecord["stage"] })}>{stages.map(stage => <option key={stage} value={stage}>{t(stageNames[stage])}</option>)}</select></label>
    <div className="phone-field-pair"><label>{t("Applied date ")}<span className="optional">{t("optional")}</span><input type="date" min="1900-01-01" max="9999-12-31" value={draft.appliedDate} onChange={e => edit({ appliedDate: e.target.value })} /></label><label>{t("Follow-up date ")}<span className="optional">{t("optional")}</span><input type="date" min="1900-01-01" max="9999-12-31" value={draft.followUpDate} onChange={e => edit({ followUpDate: e.target.value })} /></label></div>
    <label>{t("Private notes")}<textarea dir="auto" maxLength={5000} rows={5} value={draft.note} placeholder={t("People to contact, interview details, or your next step")} onChange={e => edit({ note: e.target.value })} /></label>
    {changed && <details className="phone-disclosure"><summary>{t("Compare with the saved record")}</summary><RecordSummary record={record} /><p className="preserve-lines" dir="auto">{record.note || t("No saved private note.")}</p></details>}
    {confirmClear && <div className="phone-warning" role="alert"><h3>{t("Mark as not applied?")}</h3><p>{t("This removes your own applied mark and allows a new application review. It does not withdraw an application from an employer.")}</p><button type="button" className="button secondary full" onClick={() => edit({ stage: record.stage })}>{t("Keep application record")}</button></div>}
    <div className="phone-dialog-actions"><button type="button" className="button secondary" disabled={busy} onClick={onCancel}>{t("Cancel")}</button><button type="submit" className="button primary" disabled={busy}>{confirmClear ? t("Mark not applied") : t("Save record")}</button></div>
  </form>;
}

const reviewStateLabels: Record<Plan["items"][number]["state"], string> = {
  ready: "Ready for your review",
  blocked: "Submission blocked",
  dispatching: "Checking submission",
  confirmed: "Receipt recorded — check application history",
  uncertain: "Outcome needs checking",
  rate_limited: "Waiting for provider cooldown",
  rejected: "Submission request rejected",
  cancelled: "Cancelled",
};

export function ReviewDetails({ plan }: { plan: Plan }) {
  const { t } = useI18n();
  return <div className="phone-review-items">{plan.items.map(item => <article className="phone-card" key={item.jobId}><p className="phone-kicker">{t(reviewStateLabels[item.state])}</p><h3 dir="auto">{item.title}</h3><p className="phone-company" dir="auto">{item.company}</p>{item.reason && <p className="phone-inline-note">{t(item.reason)}</p>}<dl className="phone-review-data"><dt>{t("Employer job page")}</dt><dd><a dir="ltr" href={item.job.url} target="_blank" rel="noopener noreferrer">{item.job.url}</a></dd><dt>{t("Name")}</dt><dd dir="auto">{item.payloadSummary.name || t("Not provided")}</dd><dt>{t("Email")}</dt><dd dir="auto">{item.payloadSummary.email || t("Not provided")}</dd>{item.payloadSummary.phone && <><dt>{t("Phone")}</dt><dd dir="auto">{item.payloadSummary.phone}</dd></>}{item.payloadSummary.website && <><dt>{t("Portfolio")}</dt><dd dir="auto">{item.payloadSummary.website}</dd></>}{item.payloadSummary.linkedin && <><dt>{t("LinkedIn profile")}</dt><dd dir="auto">{item.payloadSummary.linkedin}</dd></>}<dt>{t("CV")}</dt><dd>{item.resume?.name || t("No PDF selected")}</dd><dt>{t("Additional information")}</dt><dd className="preserve-lines" dir="auto">{item.payloadSummary.comments || t("None")}</dd>{item.payloadSummary.consentStore !== undefined && <><dt>{t("Employer data-processing consent")}</dt><dd dir="auto">{item.payloadSummary.consentStore ? t("Yes") : t("No")}</dd></>}{item.payloadSummary.consentMarketing !== undefined && <><dt>{t("Future contact permission")}</dt><dd dir="auto">{item.payloadSummary.consentMarketing ? t("Yes") : t("No")}</dd></>}</dl>{item.privacyPolicyUrl && <a href={item.privacyPolicyUrl} target="_blank" rel="noopener noreferrer">{t("Employer privacy policy")}</a>}</article>)}</div>;
}

export function RecordSummary({ record }: { record?: ApplicationRecord }) {
  const { t, language } = useI18n();
  if (!record) return null;
  return <div className="phone-record-summary"><span className="phone-stage">{t(stageNames[record.stage])}</span>{record.appliedElsewhere && <span>{t("You marked this as applied")}</span>}{record.followUpDate && <span>{t("Follow up ")}<bdi>{friendlyDate(record.followUpDate, language)}</bdi></span>}</div>;
}
