import { Suspense } from "react";
import { Header } from "@/components/browse/header";
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
  const mode = await serverMode();
  return (
    <InitialModeProvider value={mode}>
      <Suspense>
        <TranslationSync />
        <Header />
      </Suspense>
      <main id="content" className="min-h-dvh">
        {children}
      </main>
      {modal}
      <TabBar />
    </InitialModeProvider>
  );
}
