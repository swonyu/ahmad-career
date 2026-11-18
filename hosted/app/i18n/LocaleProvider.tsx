"use client";
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { LANGUAGE_COOKIE, LANGUAGE_KEY, cookiePreference, parsePreference, preferredLanguage, translate, type Language, type LanguagePreference } from "./core";

const LanguageContext = createContext<Language>("en");
const InitialPreferenceContext = createContext<LanguagePreference>("system");
const listeners = new Set<() => void>();
let memoryPreference: LanguagePreference | null = null;

export function getLanguagePreference(): LanguagePreference {
  if (memoryPreference !== null) return memoryPreference;
  if (typeof window === "undefined") return "system";
  try { const saved = window.localStorage.getItem(LANGUAGE_KEY); if (saved !== null) return parsePreference(saved); } catch { /* Cookie or the device remains available. */ }
  return cookiePreference(document.cookie);
}
export function getLanguage(): Language {
  const preference = getLanguagePreference();
  if (preference !== "system") return preference;
  return typeof navigator === "undefined" ? "en" : preferredLanguage(navigator.languages?.length ? navigator.languages : [navigator.language]);
}
function applyLanguage() {
  if (typeof document === "undefined") return;
  const language = getLanguage();
  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
}
function rememberCookie(preference: LanguagePreference) {
  try { document.cookie = `${LANGUAGE_COOKIE}=${preference}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`; } catch { /* An in-memory preference still works. */ }
}
function notify() { applyLanguage(); listeners.forEach(listener => listener()); }
export function subscribeLanguage(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === LANGUAGE_KEY || event.key === null) { memoryPreference = event.newValue === null ? "system" : parsePreference(event.newValue); rememberCookie(memoryPreference); notify(); } };
  const onDeviceLanguage = () => notify();
  window.addEventListener("storage", onStorage);
  window.addEventListener("languagechange", onDeviceLanguage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); window.removeEventListener("languagechange", onDeviceLanguage); };
}
export function setLanguagePreference(value: LanguagePreference): boolean {
  memoryPreference = parsePreference(value);
  let persisted = false;
  try { window.localStorage.setItem(LANGUAGE_KEY, memoryPreference); persisted = true; } catch { /* Keep the open page usable when storage is blocked. */ }
  rememberCookie(memoryPreference);
  notify();
  return persisted;
}

export default function LocaleProvider({ initialLanguage, initialPreference = "system", children }: { initialLanguage: Language; initialPreference?: LanguagePreference; children: ReactNode }) {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage, () => initialLanguage);
  useEffect(() => { applyLanguage(); }, [language]);
  return <InitialPreferenceContext.Provider value={initialPreference}><LanguageContext.Provider value={language}>{children}</LanguageContext.Provider></InitialPreferenceContext.Provider>;
}
export function useLanguagePreference() {
  const initialPreference = useContext(InitialPreferenceContext);
  return useSyncExternalStore(subscribeLanguage, getLanguagePreference, () => initialPreference);
}
export function useI18n() {
  const language = useContext(LanguageContext);
  return useMemo(() => ({ language, t: (source: string, values: readonly unknown[] = []) => translate(source, language, values) }), [language]);
}
export function T({ text, values = [] }: { text: string; values?: readonly unknown[] }) {
  const { t } = useI18n();
  return <>{t(text, values)}</>;
}
