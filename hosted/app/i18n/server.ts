import { headers } from "next/headers";
import { requestLanguage, translate } from "./core";

export async function serverI18n() {
  const incoming = await headers();
  const language = requestLanguage(incoming.get("cookie") ?? "", incoming.get("accept-language") ?? "");
  return { language, t: (source: string, values: readonly unknown[] = []) => translate(source, language, values) };
}
