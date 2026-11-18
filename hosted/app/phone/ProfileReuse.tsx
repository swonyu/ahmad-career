"use client";
import { useState } from "react";
import { Copy } from "lucide-react";
import { useI18n } from "../i18n/LocaleProvider";
import type { Profile } from "./model";

/** Copy only the field explicitly chosen; no CV bytes or background form filling. */
export function ProfileReuse({ profile }: { profile: Profile }) {
  const { t } = useI18n();
  const [notice, setNotice] = useState("");
  const fields = [
    { label: "Name", value: [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim(), direction: "auto" },
    { label: "Email", value: profile.email, direction: "ltr" },
    { label: "Phone", value: profile.phone, direction: "ltr" },
    { label: "LinkedIn profile", value: profile.linkedin, direction: "ltr" },
    { label: "Portfolio or website", value: profile.website, direction: "ltr" },
  ].filter(field => field.value.trim());
  if (!fields.length) return null;
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice("Copied. Paste it into the employer’s form and check it before submitting."); }
    catch { setNotice("Copy is unavailable. Select the text below and copy it using your device’s menu."); }
  }
  return <details className="phone-card phone-disclosure phone-profile-reuse" onToggle={() => setNotice("")}>
    <summary>{t("Reuse your contact details")}</summary>
    <p className="phone-note">{t("Copy a field when an employer asks for it. These are the details currently shown in your profile form.")}</p>
    {notice && <p className="phone-inline-note" role="status">{t(notice)}</p>}
    <dl>{fields.map(field => <div className="phone-copy-field" key={field.label}><dt>{t(field.label)}</dt><dd><span dir={field.direction}>{field.value}</span><button type="button" className="icon-button" aria-label={t("Copy {0}", [t(field.label)])} onClick={() => void copy(field.value)}><Copy size={18} aria-hidden="true" /></button></dd></div>)}</dl>
  </details>;
}
