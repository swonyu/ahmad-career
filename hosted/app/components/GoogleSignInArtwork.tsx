"use client";
import Image from "next/image";
import { useI18n } from "../i18n/LocaleProvider";

// The unmodified standard-color logo is from Google's official button asset pack.
// Live text can be translated and enlarged; the logo never flips in RTL.
// Provenance: docs/branding/2026-11-17-indigo/google-signin-assets.json
export default function GoogleSignInArtwork({ decorative = false }: { decorative?: boolean }) {
  const { t } = useI18n();
  return <span className="google-sign-in-content" aria-hidden={decorative || undefined}>
    <span className="google-sign-in-logo" aria-hidden="true"><Image src="/brand/google-signin-icon.png" alt="" width={40} height={40} unoptimized /></span>
    <span className="google-sign-in-label">{t("Sign in with Google")}</span>
  </span>;
}
