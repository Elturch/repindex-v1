import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { checkScope } from "./scopeGuard.ts";

const SAN = { ticker: "SAN", company_name: "Banco Santander" } as any;

Deno.test("[scopeGuard] null entity → reject", () => {
  const r = checkScope(null, "Analiza Apple");
  assertEquals(r.pass, false);
  assert(r.reply!.toLowerCase().includes("no encuentro"));
});

Deno.test("[scopeGuard] foreign qualifier (México) on resolved entity → reject with parent suggestion", () => {
  const r = checkScope(SAN, "Analiza Banco Santander México");
  assertEquals(r.pass, false);
  assert(r.reply!.includes("Banco Santander"));
  assert(r.reply!.includes("SAN"));
});

Deno.test("[scopeGuard] resolved Spanish entity → pass", () => {
  const r = checkScope(SAN, "Analiza Banco Santander");
  assertEquals(r.pass, true);
});