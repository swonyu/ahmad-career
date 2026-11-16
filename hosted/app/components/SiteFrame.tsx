import type { ReactNode } from "react";
export function BrandMark() {
  return <svg viewBox="20 23 76 62" fill="none" aria-hidden="true"><path fill="#D5ECD9" d="M28 31h52v46H28z"/><path fill="#173E2D" d="M36 39h36v6H36zM36 50h25v6H36zM36 61h17v6H36z"/><path fill="#A7CA87" d="m67 62 7 7 13-17 6 5-18 24-14-13z"/></svg>;
}
export default function SiteFrame({ children, active = "", narrow = false }: { children: ReactNode; active?: string; narrow?: boolean }) {
  return <><a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header"><div className="header-inner"><a className="brand" href="/phone" aria-label="Career Finder home"><span className="brand-icon"><BrandMark /></span><span>Career Finder<small>YOUR NEXT CHAPTER</small></span></a>
      <nav aria-label="Main navigation"><a href="/phone">Open app</a><a href="/connect" aria-current={active === "connect" ? "page" : undefined}>Connect</a><a href="/account" aria-current={active === "account" ? "page" : undefined}>Account</a><a href="/support" aria-current={active === "support" ? "page" : undefined}>Help</a></nav>
    </div></header><main id="main" className={narrow ? "page page-narrow" : "page"}>{children}</main>
    <footer className="site-footer"><span>Made for your next step.</span><div><a href="/privacy">Privacy</a><a href="/support">Support</a><a href="https://github.com/swonyu/ahmad-career/tree/career-finder-phones-verified-apply-20261116" target="_blank" rel="noopener noreferrer">Project source <svg className="arrow-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12 12 4M4 4h8v8" /></svg></a></div></footer></>;
}
