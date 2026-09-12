"use client";

import {
  BarChart3,
  Building2,
  CheckSquare,
  ClipboardList,
  GraduationCap,
  Shield,
  Stethoscope,
  UtensilsCrossed,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * A variant's icon, resolved through a static record.
 *
 * Never a dynamic import and never a constructed name: both defeat tree-shaking
 * and would let a registry typo become a runtime crash instead of a fallback.
 */
const ICONS: Record<string, LucideIcon> = {
  "check-square": CheckSquare,
  "graduation-cap": GraduationCap,
  shield: Shield,
  stethoscope: Stethoscope,
  "utensils-crossed": UtensilsCrossed,
  building: Building2,
  chart: BarChart3,
  clipboard: ClipboardList,
};

export function variantIcon(name?: string): LucideIcon {
  return ICONS[name || ""] || CheckSquare;
}

export function VariantIcon({ name, className }: { name?: string; className?: string }) {
  const Icon = variantIcon(name);
  return <Icon className={className} />;
}
