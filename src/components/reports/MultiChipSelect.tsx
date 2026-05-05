import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn, normalizeText } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";

interface Option {
  value: string;
  label: string;
  hint?: string;
}

interface Props {
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  emptyText?: string;
  maxBadges?: number;
}

export function MultiChipSelect({
  options,
  value,
  onChange,
  placeholder = "Seleccionar…",
  emptyText = "Sin resultados",
  maxBadges = 4,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const toggle = (v: string) => {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
    setSearch("");
  };

  const visible = value.slice(0, maxBadges);
  const overflow = value.length - visible.length;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="w-full justify-between h-auto min-h-9 py-1.5"
        >
          <div className="flex flex-wrap gap-1 items-center">
            {value.length === 0 && (
              <span className="text-muted-foreground text-sm">{placeholder}</span>
            )}
            {visible.map((v) => {
              const opt = options.find((o) => o.value === v);
              return (
                <span
                  key={v}
                  className="inline-flex items-center gap-1 bg-secondary text-secondary-foreground rounded px-1.5 py-0.5 text-xs"
                >
                  {opt?.label ?? v}
                  <X
                    className="h-3 w-3 hover:text-destructive cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(v);
                    }}
                  />
                </span>
              );
            })}
            {overflow > 0 && (
              <span className="text-xs text-muted-foreground">+{overflow}</span>
            )}
          </div>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command
          filter={(val, q) =>
            normalizeText(val).includes(normalizeText(q)) ? 1 : 0
          }
        >
          <CommandInput
            placeholder="Buscar…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const selected = value.includes(opt.value);
                return (
                  <CommandItem
                    key={opt.value}
                    value={`${opt.label} ${opt.hint ?? ""}`}
                    onSelect={() => toggle(opt.value)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selected ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="flex-1 truncate">{opt.label}</span>
                    {opt.hint && (
                      <span className="text-xs text-muted-foreground ml-2">
                        {opt.hint}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}