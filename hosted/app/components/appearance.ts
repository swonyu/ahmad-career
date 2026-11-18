export const APPEARANCE_KEY = "career-finder:appearance:v1";
export type Appearance = "system" | "light" | "dark";
let temporary: Appearance | undefined;

export function parseAppearance(value: unknown): Appearance {
  return value === "light" || value === "dark" ? value : "system";
}
export function getAppearance(): Appearance {
  if (temporary !== undefined) return temporary;
  try { return parseAppearance(window.localStorage.getItem(APPEARANCE_KEY)); } catch { return "system"; }
}
export function applyAppearance(value: Appearance) {
  const root = document.documentElement;
  root.dataset.appearance = value;
  if (value === "system") delete root.dataset.theme;
  else root.dataset.theme = value;
}
export function setAppearance(value: Appearance): boolean {
  temporary = value;
  applyAppearance(value);
  let saved = true;
  try { window.localStorage.setItem(APPEARANCE_KEY, value); } catch { saved = false; }
  window.dispatchEvent(new Event("career-appearance"));
  return saved;
}
export function subscribeAppearance(onChange: () => void) {
  const update = () => { applyAppearance(getAppearance()); onChange(); };
  const storage = (event: StorageEvent) => {
    if (event.key !== APPEARANCE_KEY && event.key !== null) return;
    temporary = undefined;
    update();
  };
  window.addEventListener("career-appearance", update);
  window.addEventListener("storage", storage);
  update();
  return () => { window.removeEventListener("career-appearance", update); window.removeEventListener("storage", storage); };
}
export const serverAppearance = (): Appearance => "system";
