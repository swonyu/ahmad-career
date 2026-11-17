"use client";
import { useId, useState } from "react";
import { Languages } from "lucide-react";
import { setLanguagePreference, useLanguagePreference, useI18n } from "../i18n/LocaleProvider";

export default function LanguageSettings() {
  const { t } = useI18n();
  const preference = useLanguagePreference();
  const id = useId(), [saveProblem, setSaveProblem] = useState(false);
  return <section className="phone-card language-card" aria-labelledby={id}>
    <div className="settings-section-heading"><span className="settings-section-icon"><Languages size={21} aria-hidden="true" /></span><div><h2 id={id}>{t("Language")}</h2><p>{t("Choose the language that feels natural to you.")}</p></div></div>
    <fieldset className="language-options"><legend className="visually-hidden">{t("Choose your app language")}</legend>
      {(["system", "en", "ar"] as const).map(value => <label className="language-option" key={value}><input type="radio" name={id} value={value} checked={preference === value} onChange={() => setSaveProblem(!setLanguagePreference(value))} /><span lang={value === "system" ? undefined : value} dir={value === "ar" ? "rtl" : undefined}>{value === "system" ? t("Match your device") : value === "en" ? "English" : "العربية"}</span></label>)}
    </fieldset>
    <p className="phone-note" role={saveProblem ? "status" : undefined}>{saveProblem ? t("Applied for this visit. Your browser could not save this preference for next time.") : t("Your language choice is saved in this browser. Job postings, names, and your own writing stay in their original language.")}</p>
  </section>;
}
