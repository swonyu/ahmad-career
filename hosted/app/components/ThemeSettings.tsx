"use client";
import { useI18n } from "../i18n/LocaleProvider";
import { useId, useState, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { getAppearance, serverAppearance, setAppearance, subscribeAppearance } from "./appearance";

export default function ThemeSettings() {
  const { t } = useI18n();
  const appearance = useSyncExternalStore(subscribeAppearance, getAppearance, serverAppearance);
  const group = useId(), [saveProblem, setSaveProblem] = useState(false);
  const choices = [{ value: "system", label: "System", detail: "Match your device", icon: Monitor }, { value: "light", label: "Light", detail: "A lighter workspace", icon: Sun }, { value: "dark", label: "Dark", detail: "A darker workspace", icon: Moon }] as const;
  return <section className="phone-card appearance-card" aria-labelledby={group + "-title"}>
    <div className="settings-section-heading"><span className="settings-section-icon"><Sun size={21} aria-hidden="true" /></span><div><h2 id={group + "-title"}>{t("Appearance")}</h2><p>{t("Make this space feel like yours.")}</p></div></div>
    <fieldset className="appearance-options"><legend className="visually-hidden">{t("Choose a color theme")}</legend>{choices.map(choice => <label key={choice.value} className={`appearance-option appearance-${choice.value}`}><input type="radio" name={group} value={choice.value} checked={appearance === choice.value} onChange={() => setSaveProblem(!setAppearance(choice.value))} /><span className="appearance-preview" aria-hidden="true"><span /><span><i /><i /><i /></span></span><span className="appearance-label"><choice.icon size={17} aria-hidden="true" />{t(choice.label)}</span><span className="appearance-description">{t(choice.detail)}</span></label>)}</fieldset>
    <p className="phone-note" role={saveProblem ? "status" : undefined}>{saveProblem ? t("Applied for this visit. Your browser could not save this preference for next time.") : t("Your preference is saved in this browser. System changes with your device’s theme.")}</p>
  </section>;
}
