import { Suspense } from "react";
import { Header } from "@/components/browse/header";
import { TabBar } from "@/components/browse/tab-bar";
import { TranslationSync } from "@/components/browse/translation-sync";

export default function BrowseLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  return (
    <>
      <Suspense>
        <TranslationSync />
        <Header />
      </Suspense>
      <main id="content" className="min-h-dvh">{children}</main>
      {modal}
      <TabBar />
    </>
  );
}
