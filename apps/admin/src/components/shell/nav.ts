import {
  BadgeCheck,
  Clapperboard,
  CreditCard,
  Cpu,
  FolderTree,
  Gauge,
  LayoutTemplate,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: Array<"superadmin" | "content_manager" | "analyst">;
}

export const NAV: Array<{ section: string; items: NavItem[] }> = [
  {
    section: "Overview",
    items: [{ href: "/", label: "Dashboard", icon: Gauge }],
  },
  {
    section: "Content",
    items: [
      { href: "/titles", label: "Titles", icon: Clapperboard },
      { href: "/categories", label: "Categories", icon: FolderTree },
      { href: "/home-layout", label: "Home layout", icon: LayoutTemplate },
      { href: "/transcoding", label: "Transcoding", icon: Cpu },
    ],
  },
  {
    section: "Membership",
    items: [
      { href: "/plans", label: "Plans", icon: CreditCard },
      { href: "/subscribers", label: "Subscribers", icon: BadgeCheck },
    ],
  },
  {
    section: "People",
    items: [
      { href: "/users", label: "Users", icon: Users },
      { href: "/staff", label: "Staff & roles", icon: ShieldCheck, roles: ["superadmin"] },
    ],
  },
  {
    section: "System",
    items: [
      { href: "/settings", label: "Settings", icon: Settings, roles: ["superadmin"] },
      { href: "/audit", label: "Audit log", icon: ScrollText, roles: ["superadmin"] },
    ],
  },
];
