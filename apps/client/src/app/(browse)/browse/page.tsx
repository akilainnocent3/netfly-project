import type { Metadata } from "next";
import { HomeFeed } from "@/components/browse/home-feed";

export const metadata: Metadata = { title: "Home" };

export default function BrowsePage() {
  return <HomeFeed />;
}
