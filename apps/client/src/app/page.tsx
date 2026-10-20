import { redirect } from "next/navigation";

// Signed-in visitors are sent to /browse by middleware.
export default function Index() {
  redirect("/signup");
}
