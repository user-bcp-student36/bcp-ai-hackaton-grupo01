import { Route, Routes } from "react-router";
import { HomePage } from "./features/system/HomePage";
import { SampleFormPage } from "./features/sample/SampleFormPage";
import { LoginPage } from "./features/auth/LoginPage";
import { WalletPage } from "./features/auth/WalletPage";
import { RegistrationPage } from "./features/onboarding/RegistrationPage";
import { BiometricPage } from "./features/biometric/BiometricPage";
import { ContactsPage } from "./features/contacts/ContactsPage";
import { PaymentRoute } from "./features/payments/PaymentRoute";
import { ReceiveQrPage } from "./features/qr/ReceiveQrPage";
import { ScanQrPage } from "./features/qr/ScanQrPage";
import { PaymentHistoryPage } from "./features/receipt-history/PaymentHistoryPage";
import { PaymentReceiptPage } from "./features/receipt-history/PaymentReceiptPage";
import { useReceiptSession } from "./features/receipt-history/useReceiptSession";
import { SessionProvider } from "./lib/session";

function HistoryRoute() {
  return <PaymentHistoryPage session={useReceiptSession()} />;
}

function ReceiptRoute() {
  return <PaymentReceiptPage session={useReceiptSession()} />;
}

export function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/ejemplo/formulario" element={<SampleFormPage />} />
        <Route path="/registro" element={<RegistrationPage />} />
        <Route path="/ingresar" element={<LoginPage />} />
        <Route path="/biometria" element={<BiometricPage />} />
        <Route path="/billetera" element={<WalletPage />} />
        <Route path="/contactos" element={<ContactsPage />} />
        <Route path="/pagos" element={<PaymentRoute />} />
        <Route path="/cobrar" element={<ReceiveQrPage />} />
        <Route path="/pagar-qr" element={<ScanQrPage />} />
        <Route path="/movimientos" element={<HistoryRoute />} />
        <Route path="/movimientos/:paymentId" element={<ReceiptRoute />} />
      </Routes>
    </SessionProvider>
  );
}
