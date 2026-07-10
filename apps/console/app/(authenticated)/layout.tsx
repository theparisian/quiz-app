'use client';

import ConsoleShell from '@/components/console-shell';

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return <ConsoleShell>{children}</ConsoleShell>;
}
