import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { useHasSession } from "../lib/session";
import bcpLogo from "./bcp-logo.svg";

export const DEMO_DISCLAIMER =
  "Demo local: identidades y fondos ficticios. No es una billetera real.";

const NAV_LINKS = [
  { to: "/", label: "Inicio" },
  { to: "/billetera", label: "Saldo" },
  { to: "/contactos", label: "Contactos" },
  { to: "/pagos", label: "Pagos" },
  { to: "/pagar-qr", label: "Pagar QR" },
  { to: "/cobrar", label: "Cobrar QR" },
  { to: "/movimientos", label: "Historial" },
] as const;

type Props = {
  title?: string;
  children: ReactNode;
};

export function PageShell({ title, children }: Props) {
  // Signed-out visitors only get Inicio: every other page needs a session.
  const hasSession = useHasSession();
  const links = hasSession ? NAV_LINKS : NAV_LINKS.slice(0, 1);
  return (
    <div className="page-frame">
      <header className="app-header">
        <div className="app-header-inner">
          <Link className="brand" to="/">
            <img className="brand-logo" src={bcpLogo} alt="BCP" />
            <span>Altoque</span>
          </Link>
          <nav className="app-nav" aria-label="Principal">
            {links.map((link) => (
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
