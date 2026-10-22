import { AccountNav } from "@/components/account/account-nav";

/** Account: Netflix-style left navigation (Overview, Membership, Usage, Security, Profiles). */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-tabbar px-[max(4vw,16px)] pt-[calc(var(--header-h)+28px)]">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-h1 mb-6 font-black tracking-tight">Account</h1>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
          <AccountNav />
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
