"use client";
import { ArrowRight, FileText, ListChecks } from "lucide-react";
import { useI18n } from "../i18n/LocaleProvider";
import { formatNumber } from "../i18n/core";
import type { Profile } from "./model";

/** The employer-site route is useful before an account or integration exists. */
export function ApplicationGuide({ profile, hasJobs, onJobs, onProfile }: {
  profile: Profile; hasJobs: boolean; onJobs: () => void; onProfile: () => void;
}) {
  const { t, language } = useI18n();
  return <section className="phone-card phone-application-guide" aria-labelledby="application-guide-title">
    <div className="phone-guide-heading"><ListChecks size={24} aria-hidden="true" /><h2 id="application-guide-title">{t("Apply on the employer’s website")}</h2></div>
    <p>{t("You can apply on an employer’s website and keep your own record here. No Career Finder account is required.")}</p>
    <div className="phone-apply-profile">{profile.resume && <span className="phone-selected-cv"><FileText size={16} aria-hidden="true" /><bdi>{profile.resume.name}</bdi></span>}<button className="text-button" onClick={onProfile}>{t("Review profile and CV")}<ArrowRight size={16} aria-hidden="true" /></button></div>
    <button className="button primary full" onClick={onJobs}>{t(hasJobs ? "Choose a saved job" : "Find a job")}<ArrowRight size={18} aria-hidden="true" /></button>
    <ol className="phone-application-steps">
      <li><span className="phone-step-number" aria-hidden="true">{formatNumber(1, language)}</span><div><strong>{t("Choose and save a job")}</strong><p>{t("Save the job before opening the employer’s page. Check its requirements, location and deadline there.")}</p></div></li>
      <li><span className="phone-step-number" aria-hidden="true">{formatNumber(2, language)}</span><div><strong>{t("Check your CV and details")}</strong><p>{t("Use the CV and answers that fit this job. Review them before submitting.")}</p></div></li>
      <li><span className="phone-step-number" aria-hidden="true">{formatNumber(3, language)}</span><div><strong>{t("Record what happened")}</strong><p>{t("After applying, update the job in Saved and add a follow-up date. Your record is separate from the employer’s confirmation.")}</p></div></li>
    </ol>
  </section>;
}
