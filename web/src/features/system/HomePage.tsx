import { Link } from "react-router";
import { useSession } from "../../lib/session";
import heroIllustration from "../../ui/hero-illustration.svg";
import { PageShell } from "../../ui/PageShell";
import { StatusMessage } from "../../ui/StatusMessage";
import { useHealth } from "./useHealth";

export function HomePage() {
  const health = useHealth();
  const { session } = useSession();

  return (
    <PageShell>
      <section className="hero" aria-labelledby="home-title">
        <div className="hero-text">
          <h1 id="home-title">Envía soles a tus contactos sin vueltas</h1>
          <p>
            Crea tu cuenta, verifica tu identidad y paga en pocos pasos. Todo
            con datos ficticios.
          </p>
          {session ? (
            <div className="form-actions">
              <Link className="button-link" to="/pagos">
                Pagar
              </Link>
              <Link className="button-link button-secondary" to="/pagar-qr">
                Pagar con QR
              </Link>
              <Link className="button-link button-secondary" to="/contactos">
                Mis contactos
              </Link>
              <Link className="button-link button-secondary" to="/billetera">
                Mi billetera
              </Link>
            </div>
          ) : (
            <div className="form-actions">
              <Link className="button-link" to="/registro">
                Crear cuenta
              </Link>
              <Link className="button-link button-secondary" to="/ingresar">
                Ingresar
              </Link>
            </div>
          )}
        </div>
        <img
          className="hero-art"
          src={heroIllustration}
          alt="Un celular con una billetera, monedas y un código QR"
        />
      </section>
      {health.isPending ? (
        <StatusMessage tone="info">Comprobando el servicio…</StatusMessage>
      ) : null}
      {health.isError ? (
        <StatusMessage tone="error">
          No se pudo conectar con el servicio local. Revisa que la API esté en
          marcha.
        </StatusMessage>
      ) : null}
      {health.isSuccess ? (
        <StatusMessage tone="success">Servicio disponible.</StatusMessage>
      ) : null}
    </PageShell>
  );
}
