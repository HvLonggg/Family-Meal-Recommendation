import { AppProviders } from '@/app/providers/AppProviders';
import { AppRouter } from '@/app/router/AppRouter';
import { TermsGate } from '@/features/legal/TermsGate';
import { PwaPrompts } from '@/features/pwa/PwaPrompts';
import { SystemStatusNotice } from '@/features/system/SystemStatusNotice';

export function App() {
  return (
    <AppProviders>
      <AppRouter />
      <PwaPrompts />
      <SystemStatusNotice />
      {/* Mọi khu vực (công khai, quản trị, chế độ nấu) đều cần đồng ý Điều khoản hiện hành. */}
      <TermsGate />
    </AppProviders>
  );
}
