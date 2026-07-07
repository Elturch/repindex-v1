import { cn } from "@/lib/utils";
import type { ConsensusLevel } from "@/hooks/useConsensus";

const LEVEL_STYLE: Record<string, { label: string; cls: string }> = {
  unanime: {
    label: "Unánime",
    cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  fuerte: {
    label: "Fuerte",
    cls: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  },
  debil: {
    label: "Débil",
    cls: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  disperso: {
    label: "Disperso",
    cls: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
  },
};

interface Props {
  value: number;
  level: ConsensusLevel;
  size?: "sm" | "md";
  className?: string;
}

export function ConsensusBadge({ value, level, size = "sm", className }: Props) {
  const meta = LEVEL_STYLE[level] ?? LEVEL_STYLE.debil;
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <span
      title={`Consenso ${v}/100 · ${meta.label}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium tabular-nums",
        size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5",
        meta.cls,
        className,
      )}
    >
      <span className="font-mono">{v}</span>
      <span className="uppercase tracking-wider text-[9px] opacity-80">{meta.label}</span>
    </span>
  );
}

export default ConsensusBadge;