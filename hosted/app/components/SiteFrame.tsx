"use client";
import { useI18n } from "../i18n/LocaleProvider";
import type { ReactNode } from "react";
import Image from "next/image";
import { Settings2 } from "lucide-react";
import OAuthFeedback from "./OAuthFeedback";
export function BrandMark() {
  return <Image className="brand-mark" src="/phone-icon-192.png" width={42} height={42} alt="" unoptimized />;
}
export default function SiteFrame({ children, active = "", narrow = false }: { children: ReactNode; active?: string; narrow?: boolean }) {
  const { t } = useI18n();
  return <><a className="skip-link" href="#main">{t("Skip to content")}</a>
    <header className="site-header"><div className="header-inner"><a className="brand" href="/phone" aria-label={t("Career Finder home")}><span className="brand-icon"><BrandMark /></span><span>{t("Career Finder")}<small>{t("YOUR CAREER WORKSPACE")}</small></span></a>
      <nav aria-label={t("Main navigation")}><a href="/phone">{t("Open app")}</a><a href="/connect" aria-current={active === "connect" ? "page" : undefined}>{t("Connect")}</a><a href="/account" aria-current={active === "account" ? "page" : undefined}>{t("Account")}</a><a href="/support" aria-current={active === "support" ? "page" : undefined}>{t("Help")}</a><a className="site-settings-link" href="/phone#settings"><Settings2 size={17} aria-hidden="true" />{t("Settings")}</a></nav>
    </div></header><main id="main" className={narrow ? "page page-narrow" : "page"}><OAuthFeedback />{children}</main>
    <footer className="site-footer"><span>{t("Made for your next step.")}</span><div><a href="/privacy">{t("Privacy")}</a><a href="/support">{t("Support")}</a><a href="https://github.com/swonyu/ahmad-career/tree/career-finder-phones-verified-apply-20261116" target="_blank" rel="noopener noreferrer">{t("Project source ")}<svg className="arrow-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12 12 4M4 4h8v8" /></svg></a></div></footer></>;
}
