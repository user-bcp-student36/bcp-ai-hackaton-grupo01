import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";
import bcpLogo from "./bcp-logo.svg";

export const DEMO_DISCLAIMER =
  "Demo local: identidades y fondos ficticios. No es una billetera real.";

const NAV_LINKS = [
  { to: "/billetera", label: "Saldo" },
  { to: "/contactos", label: "Contactos" },
  { to: "/pagos", label: "Pagos" },
  { to: "/movimientos", label: "Historial" },
] as const;

type Props = {
  title?: string;
  children: ReactNode;
};

export function PageShell({ title, children }: Props) {
  return (
    <div className="page-frame">
      <header className="app-header">
        <div className="app-header-inner">
          <Link className="brand" to="/">
            <img className="brand-logo" src={bcpLogo} alt="BCP" />
            <span>Altoque</span>
          </Link>
          <nav className="app-nav" aria-label="Principal">
            {NAV_LINKS.map((link) => (
              <NavLink key={link.to} to={link.to}>
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <div className="page-shell">
        <main>
          {title ? <h1>{title}</h1> : null}
          {children}
        </main>
      </div>
      <footer className="app-footer">
        <p className="disclaimer">{DEMO_DISCLAIMER}</p>
      </footer>
    </div>
  );
}
