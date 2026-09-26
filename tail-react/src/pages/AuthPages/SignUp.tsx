import SignUpForm from "@/components/auth/SignUpForm";
import PageMeta from "@/components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";
import { useTranslation } from "react-i18next";

export default function SignUp() {
  const { t } = useTranslation();
  return (
    <>
      <PageMeta
        title={`${t("auth.signUp")} | TailAdmin`}
        description={t("auth.signUpDescription")}
      />
      <AuthLayout>
        <SignUpForm />
      </AuthLayout>
    </>
  );
}
