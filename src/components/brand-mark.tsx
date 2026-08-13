import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({
  logo,
  className,
}: {
  logo?: string | null;
  className?: string;
}) {
  return logo ? (
    <img
      src={logo}
      alt=""
      className={cn("size-8 rounded-xl object-cover", className)}
    />
  ) : (
    <span
      className={cn(
        "grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm",
        className,
      )}
    >
      <Sparkles className="size-4" />
    </span>
  );
}
