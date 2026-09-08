"use client";
import DashboardHeader from "./Dashboard/DashboardHeader";
import GeneralHeader from "./General/GeneralHeader";
import { usePathname } from "next/navigation";

import Links from "@/utils/static.json";

export default function Header() {
  const path = usePathname();
  return <>{!path.includes("/dashboard") ? <GeneralHeader navLinks={Links.navLinks} /> : <DashboardHeader DashboardnavLinks={Links.dashboardNavLinks} />}</>;
}
