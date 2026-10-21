import { Suspense } from "react";
import { Header } from "@/components/browse/header";
import { ProfileGate } from "@/components/profiles/profile-gate";
import { TabBar } from "@/components/browse/tab-bar";
import { TranslationSync } from "@/components/browse/translation-sync";
import { InitialModeProvider } from "@/components/providers/initial-mode";
import { serverMode } from "@/lib/server-mode";

export default async function BrowseLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  // One design for everyone: signed-out visitors get the same chrome (Sign In instead of the
  // profile menu); actions that need an account open the sign-in gate.
  const mode = await serverMode();
  return (
    <InitialModeProvider value={mode}>
      <ProfileGate>
        <Suspense>
          <TranslationSync />
          <Header />
        </Suspense>
        <main id="content" className="min-h-dvh">
          {children}
        </main>
        {modal}
        <TabBar />
      </ProfileGate>
    </InitialModeProvider>
  );
}
