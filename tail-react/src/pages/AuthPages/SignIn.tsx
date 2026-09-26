import SignInForm from "@/components/auth/SignInForm";
import PageMeta from "@/components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";
import { useTranslation } from "react-i18next";

export default function SignIn() {
  const { t } = useTranslation();
  return (
    <>
      <PageMeta
        title={`${t("auth.signIn")} | TailAdmin`}
        description={t("auth.signInDescription")}
      />
      <AuthLayout>
        <SignInForm />
      </AuthLayout>
    </>
  );
}
