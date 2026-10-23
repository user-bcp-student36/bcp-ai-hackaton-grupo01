import { Route, Routes } from "react-router";
import { HomePage } from "./features/system/HomePage";
import { SampleFormPage } from "./features/sample/SampleFormPage";
import { LoginPendingPage } from "./features/onboarding/LoginPendingPage";
import { RegistrationPage } from "./features/onboarding/RegistrationPage";
import { ContactsPage } from "./features/contacts/ContactsPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/ejemplo/formulario" element={<SampleFormPage />} />
      <Route path="/registro" element={<RegistrationPage />} />
      <Route path="/ingresar" element={<LoginPendingPage />} />
      <Route path="/contactos" element={<ContactsPage />} />
    </Routes>
  );
}
