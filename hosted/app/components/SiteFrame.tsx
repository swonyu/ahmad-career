import type { ReactNode } from "react";
export function BrandMark() {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m5 6 23 10L5 26l4-9 12-1-12-1-4-9Z" fill="currentColor" /></svg>;
}
export default function SiteFrame({ children, active = "", narrow = false }: { children: ReactNode; active?: string; narrow?: boolean }) {
  return <><a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header"><div className="header-inner"><a className="brand" href="/connect" aria-label="Career Finder home"><span className="brand-icon"><BrandMark /></span><span>Career Finder<small>YOUR NEXT CHAPTER</small></span></a>
      <nav aria-label="Main navigation"><a href="/connect" aria-current={active === "connect" ? "page" : undefined}>Connect</a><a href="/account" aria-current={active === "account" ? "page" : undefined}>Account</a><a href="/support" aria-current={active === "support" ? "page" : undefined}>Help</a></nav>
    </div></header><main id="main" className={narrow ? "page page-narrow" : "page"}>{children}</main>
    <footer className="site-footer"><span>Made for your next step.</span><div><a href="/privacy">Privacy</a><a href="/support">Support</a><a href="https://github.com/swonyu/ahmad-career" target="_blank" rel="noopener noreferrer">Project source <svg className="arrow-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12 12 4M4 4h8v8" /></svg></a></div></footer></>;
}
