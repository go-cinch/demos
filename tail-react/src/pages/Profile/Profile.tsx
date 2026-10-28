import PageMeta from "@/components/common/PageMeta";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import { useTranslation } from "react-i18next";
import ProfileCenter from "./profile-center";
import PasswordSettings from "./password-settings";
export default function Profile() {
  const { t } = useTranslation();
  return (
    <>
      <PageMeta
        title={`${t("profile.title")} | TailAdmin`}
        description={t("profile.description")}
      />
      <PageBreadCrumb pageTitle={t("profile.title")} />
      <ProfileCenter>
        <PasswordSettings />
      </ProfileCenter>
    </>
  );
}
