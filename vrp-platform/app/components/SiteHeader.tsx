import Link from "next/link";

const nav = [
  { href: "/", label: "Home" },
  { href: "/solver", label: "Solver" },
  { href: "/analytics", label: "Analytics" },
  { href: "/predictions", label: "Predictions" },
  { href: "/report", label: "Reports" },
] as const;

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="site-header__brand">
          <span className="site-header__mark" aria-hidden />
          <span>
            <span className="site-header__title">VRP Lab</span>
            <span className="site-header__subtitle">Clarke–Wright &amp; routing tools</span>
          </span>
        </Link>
        <nav className="site-header__nav" aria-label="Main">
          {nav.map(({ href, label }) => (
            <Link key={href} href={href} className="site-header__link">
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
