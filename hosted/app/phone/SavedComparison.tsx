"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Columns2 } from "lucide-react";
import { useI18n } from "../i18n/LocaleProvider";
import { formatDateTime, formatNumber } from "../i18n/core";
import { friendlyDate, jobIdentity, stageNames, type ApplicationRecord, type Job } from "./model";
import { Modal } from "./components";
import { displayHistoricalText } from "./historical-text";
import { availableComparisonSelection, savedComparisonRows, toggleComparisonSelection, type SavedComparisonRow } from "./saved-comparison";

const historyKey = "careerFinderSavedComparison";
type Controls = { toolbar: ReactNode; choice: (job: Job) => ReactNode };
type HistoryEntry = { token: string; previous: unknown; url: string; x: number; y: number };

/** The parent keys this component by account scope and unmounts it during identity checks. */
export function SavedComparison({ jobs, records, disabled, children }: {
  jobs: readonly Job[]; records: readonly ApplicationRecord[]; disabled: boolean;
  children: (controls: Controls) => ReactNode;
}) {
  const { t: translate, language } = useI18n();
  const t: typeof translate = (...args) => displayHistoricalText(translate(...args));
  const rows = useMemo(() => savedComparisonRows(jobs, records), [jobs, records]);
  const [selected, setSelected] = useState<string[]>([]);
  const [pair, setPair] = useState<string[] | null>(null);
  const [closing, setClosing] = useState(false);
  const entry = useRef<HistoryEntry | null>(null);
  const chosen = availableComparisonSelection(selected, rows);
  const compared = pair?.map(identity => rows.find(row => row.identity === identity));

  useEffect(() => {
    const onPop = () => {
      const owned = entry.current;
      if (!owned || window.history.state?.[historyKey] === owned.token) return;
      entry.current = null; setPair(null); setClosing(false);
      if (location.href === owned.url) requestAnimationFrame(() => window.scrollTo({ left: owned.x, top: owned.y, behavior: "instant" }));
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      const owned = entry.current;
      // Account or tab changes may unmount us. Remove only our marker, preserving
      // the current destination; never navigate back across that account change.
      if (owned && window.history.state?.[historyKey] === owned.token) window.history.replaceState(owned.previous, "", location.href);
      entry.current = null;
    };
  }, []);

  const open = () => {
    if (disabled || closing || chosen.length !== 2 || entry.current) return;
    const previous = window.history.state, token = crypto.randomUUID();
    const owned = { token, previous, url: location.href, x: scrollX, y: scrollY };
    window.history.pushState({ ...(previous && typeof previous === "object" ? previous : {}), [historyKey]: token }, "", owned.url);
    entry.current = owned; setPair([...chosen]);
  };
  const close = () => {
    const owned = entry.current;
    setPair(null);
    if (owned && window.history.state?.[historyKey] === owned.token) { setClosing(true); window.history.back(); }
    else { entry.current = null; setClosing(false); }
  };
  const identify = (row: SavedComparisonRow) => displayHistoricalText(`${row.job.title} · ${displayHistoricalText(row.job.location) || t("Location not specified")}`);
  const fields = [
    { label: "Source", value: (row: SavedComparisonRow) => row.job.sourceName || t("Not recorded") },
    { label: "Last checked", value: (row: SavedComparisonRow) => row.job.checkedAt ? formatDateTime(row.job.checkedAt, language) : t("Not recorded") },
    { label: "Stage", value: (row: SavedComparisonRow) => t(stageNames[row.record?.stage ?? "saved"]) },
    { label: "Follow-up date", value: (row: SavedComparisonRow) => row.record?.followUpDate ? friendlyDate(row.record.followUpDate, language) : t("No follow-up scheduled") },
  ];
  const toolbar = rows.length > 0 && <section className="phone-compare-toolbar" aria-label={t("Compare saved openings")}>
    <div><p aria-live="polite">{chosen.length ? t("{0} of 2 selected", [formatNumber(chosen.length, language)]) : t("Choose two saved openings.")}</p></div>
    <div className="phone-compare-actions">{chosen.length > 0 && <button type="button" className="text-button" disabled={disabled || closing} onClick={() => setSelected([])}>{t("Clear selection")}</button>}<button type="button" className="button secondary" disabled={disabled || chosen.length !== 2} aria-disabled={closing || undefined} onClick={open}><Columns2 size={17} aria-hidden="true" />{t("Compare two")}</button></div>
  </section>;
  const choice = (job: Job) => {
    const identity = jobIdentity(job.url), checked = chosen.includes(identity);
    return <label className={`phone-compare-choice${checked ? " is-selected" : ""}`}><input type="checkbox" checked={checked} disabled={disabled || closing || !checked && chosen.length >= 2} aria-label={t("Compare {0} at {1} in {2}", [job.title, job.company, job.location || t("Location not specified")])} onChange={() => setSelected(previous => toggleComparisonSelection(previous, identity, rows))} /><span>{t("Compare")}</span></label>;
  };
  return <>{children({ toolbar, choice })}{pair && <Modal title={t("Compare two openings")} onClose={close}>
    {compared?.length === 2 && compared.every((row): row is SavedComparisonRow => Boolean(row)) ? <div className="phone-comparison">
      <div className="phone-comparison-head">{compared.map(row => <section key={row.identity}>
        <span className="phone-comparison-location"><bdi>{displayHistoricalText(row.job.location) || t("Location not specified")}</bdi></span>
        <h3 dir="auto">{displayHistoricalText(row.job.title)}</h3><p className="phone-company"><bdi>{displayHistoricalText(row.job.company) || t("Not recorded")}</bdi></p>
        {!row.bookmarked && <p className="phone-note">{t("Application record · bookmark removed")}</p>}
      </section>)}</div>
      <dl className="phone-comparison-fields">{fields.map(field => <div key={field.label}><dt>{t(field.label)}</dt>{compared.map(row => <dd key={row.identity}><span className="visually-hidden">{identify(row)}: </span><bdi>{displayHistoricalText(field.value(row))}</bdi></dd>)}</div>)}</dl>
      <div className="phone-comparison-links">{compared.map(row => <a key={row.identity} className="text-button" href={row.job.url} target="_blank" rel="noopener noreferrer" aria-label={t("Open job: {0} in {1}", [row.job.title, row.job.location || t("Location not specified")])}>{t("Open job ")}<ArrowUpRight size={16} aria-hidden="true" /></a>)}</div>
      <p className="phone-note">{t("Stages and follow-up dates are your own records.")}</p>
    </div> : <p className="phone-note" role="status">{t("A selected opening is no longer in Saved. Choose the two openings again.")}</p>}
    <div className="phone-dialog-actions"><button type="button" className="button primary" onClick={close}>{t("Back to Saved")}</button></div>
  </Modal>}</>;
}

