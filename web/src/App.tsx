import { Route, Routes } from "react-router";
import { HomePage } from "./features/system/HomePage";
import { SampleFormPage } from "./features/sample/SampleFormPage";
import { LoginPage } from "./features/auth/LoginPage";
import { WalletPage } from "./features/auth/WalletPage";
import { RegistrationPage } from "./features/onboarding/RegistrationPage";
import { ContactsPage } from "./features/contacts/ContactsPage";
import { PaymentPage } from "./features/payments/PaymentPage";
import { CURRENT_OWNER_ID } from "./features/payments/session";
import { PaymentHistoryPage } from "./features/receipt-history/PaymentHistoryPage";
import { PaymentReceiptPage } from "./features/receipt-history/PaymentReceiptPage";
import { SessionProvider } from "./lib/session";

export function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/ejemplo/formulario" element={<SampleFormPage />} />
        <Route path="/registro" element={<RegistrationPage />} />
        <Route path="/ingresar" element={<LoginPage />} />
        <Route path="/billetera" element={<WalletPage />} />
        <Route path="/contactos" element={<ContactsPage />} />
        <Route
          path="/pagos"
          element={<PaymentPage ownerUserId={CURRENT_OWNER_ID} />}
        />
        <Route path="/movimientos" element={<PaymentHistoryPage />} />
        <Route path="/movimientos/:paymentId" element={<PaymentReceiptPage />} />
      </Routes>
    </SessionProvider>
  );
}
