import { useEffect, useState } from "react";
import { Beaker } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  type AgentVersion,
  getAgentVersion,
  isPreviewEnvironment,
  setAgentVersion,
} from "@/lib/agentVersion";

/**
 * Preview-only A/B switch between Agente Rix v1 (chat-intelligence) and
 * v2 (chat-intelligence-v2). Hidden in production builds.
 */
export function AgentVersionToggle() {
  const [version, setVersionState] = useState<AgentVersion>("v1");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(isPreviewEnvironment());
    setVersionState(getAgentVersion());
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<AgentVersion>).detail;
      if (detail === "v1" || detail === "v2") setVersionState(detail);
    };
    window.addEventListener("repindex:agent-version-change", onChange);
    return () => window.removeEventListener("repindex:agent-version-change", onChange);
  }, []);

  if (!visible) return null;

  const isV2 = version === "v2";
  const handleToggle = (checked: boolean) => {
    const next: AgentVersion = checked ? "v2" : "v1";
    setAgentVersion(next);
    setVersionState(next);
  };

  return (
    <div
      className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-2.5 py-1.5 text-xs"
      title="Preview-only · A/B test agent version"
    >
      <Beaker className="h-3.5 w-3.5 text-muted-foreground" />
      <Label htmlFor="agent-version-switch" className="cursor-pointer text-[11px] font-medium text-muted-foreground">
        Agente
      </Label>
      <span className={`text-[11px] font-mono font-semibold ${isV2 ? "text-muted-foreground" : "text-foreground"}`}>v1</span>
      <Switch
        id="agent-version-switch"
        checked={isV2}
        onCheckedChange={handleToggle}
        aria-label="Toggle agent version"
      />
      <span className={`text-[11px] font-mono font-semibold ${isV2 ? "text-foreground" : "text-muted-foreground"}`}>v2</span>
    </div>
  );
}