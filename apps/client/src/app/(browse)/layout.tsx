import { Suspense } from "react";
import { Header } from "@/components/browse/header";
import { ProfileGate } from "@/components/profiles/profile-gate";
import { TabBar } from "@/components/browse/tab-bar";
import { TranslationSync } from "@/components/browse/translation-sync";
import { InitialModeProvider } from "@/components/providers/initial-mode";
import { isSignedIn } from "@/lib/seo";
import { serverMode } from "@/lib/server-mode";

export default async function BrowseLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  // Signed-out visitors only reach /title/* (middleware): it renders its own public, crawlable
  // page, so none of the app chrome (profile gate, header, modal slot) applies.
  if (!(await isSignedIn())) return children;
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
