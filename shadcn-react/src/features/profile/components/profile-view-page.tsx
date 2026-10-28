'use client';
import PageContainer from '@/components/layout/page-container';
import { useLocale } from '@/features/i18n/locale-context';
import ProfileCenter from './profile-center';
import PasswordSettings from './password-settings';
export default function ProfileViewPage() {
  const { pick } = useLocale();
  return (
    <PageContainer pageTitle={pick('Profile', '个人中心')}>
      <ProfileCenter>
        <PasswordSettings />
      </ProfileCenter>
    </PageContainer>
  );
}
