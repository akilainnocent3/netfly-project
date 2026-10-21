import type { Metadata } from "next";
import { Suspense } from "react";
import { NewAndPopular } from "./new-and-popular";

export const metadata: Metadata = { title: "New & Popular" };

export default function NewAndPopularPage() {
  return (
    <Suspense>
      <NewAndPopular />
    </Suspense>
  );
}
