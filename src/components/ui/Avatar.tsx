"use client";

import Image from "next/image";
import menAvatar from "@/assets/avatar/Men.svg";
import womenAvatar from "@/assets/avatar/Women.svg";
import { cn, initials } from "@/lib/utils";

export const AVATAR_OPTIONS = ["men", "women", "initials"] as const;
export type AvatarChoice = (typeof AVATAR_OPTIONS)[number];

const sizes = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-lg",
  xl: "h-24 w-24 text-2xl",
};

export function Avatar({
  name,
  avatar = "initials",
  size = "md",
  className,
}: {
  name?: string;
  avatar?: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const shared = cn(
    "shrink-0 overflow-hidden rounded-full ring-2 ring-border bg-surface-sunken",
    sizes[size],
    className
  );

  if (avatar === "men" || avatar === "women") {
    return (
      <span className={shared}>
        <Image src={avatar === "men" ? menAvatar : womenAvatar} alt={name || "Avatar"} className="h-full w-full object-cover" />
      </span>
    );
  }

  return (
    <span
      className={cn(shared, "flex items-center justify-center bg-primary font-semibold text-primary-fg ring-primary/30")}
      aria-label={name}
    >
      {initials(name)}
    </span>
  );
}
