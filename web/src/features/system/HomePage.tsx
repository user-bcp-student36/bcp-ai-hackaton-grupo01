import { Link } from "react-router";
import { PageShell } from "../../ui/PageShell";
import { StatusMessage } from "../../ui/StatusMessage";
import { useHealth } from "./useHealth";

export function HomePage() {
  const health = useHealth();

  return (
    <PageShell>
      <section className="hero" aria-labelledby="home-title">
        <h1 id="home-title">Envía soles a tus contactos sin vueltas</h1>
        <p>
          Crea tu cuenta, verifica tu identidad y paga en pocos pasos. Todo
          con datos ficticios.
        </p>
        <div className="form-actions">
          <Link className="button-link" to="/registro">
            Crear cuenta
          </Link>
          <Link className="button-link button-secondary" to="/ingresar">
            Ingresar
          </Link>
        </div>
      </section>
      {health.isPending ? (
        <StatusMessage tone="info">Comprobando el servicio…</StatusMessage>
      ) : null}
      {health.isError ? (
        <StatusMessage tone="error">
          No se pudo conectar con el servicio local. Revisa que la API esté
          en marcha.
        </StatusMessage>
      ) : null}
      {health.isSuccess ? (
        <StatusMessage tone="success">Servicio disponible.</StatusMessage>
      ) : null}
    </PageShell>
  );
}
