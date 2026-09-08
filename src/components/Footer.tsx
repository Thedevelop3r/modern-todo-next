"use client";
import React from "react";
import GeneralFooter from "./General/GeneralFooter";
import DashboardFooter from "./Dashboard/DashboardFooter";
import { usePathname } from "next/navigation";
import Links from "@/utils/static.json";

export default function Footer() {
  const path = usePathname();
  return <>{!path.includes("/dashboard") ? <GeneralFooter GenralNavbarLinks={Links.generalLinks} /> : <DashboardFooter DashboardnavLinks={Links.generalLinks} />}</>;
}
