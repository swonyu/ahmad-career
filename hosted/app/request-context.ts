import type { ChatGPTUser } from "./chatgpt-auth";
import type { Language, LanguagePreference } from "./i18n/core";

/** Only public page identity and language state cross the SSR/hydration boundary. */
export type AppRequestContext = Readonly<{
  user: ChatGPTUser | null;
  language: Language;
  languagePreference: LanguagePreference;
}>;
export type PageProps = Readonly<{ context: AppRequestContext }>;
