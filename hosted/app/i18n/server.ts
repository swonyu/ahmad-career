import type { AppRequestContext } from "../request-context";
import { translate } from "./core";

/** A value supplied by this render, never global state or a cached request. */
export function serverI18n(context: Pick<AppRequestContext, "language">) {
  const { language } = context;
  return { language, t: (source: string, values: readonly unknown[] = []) => translate(source, language, values) };
}
