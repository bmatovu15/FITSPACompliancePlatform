// Proves that the generic, admin-editable rule model reproduces the real Payments and Digital Lending
// applicability engines exactly, for every combination of the profile questions.
// Run: npx tsx scripts/verify-admin-rules.ts
import { seedState } from "../src/app/fitspa-admin/admin-seed";
import { universe } from "../src/app/fitspa-admin/admin-rules";
import { applicableEntries, blankProfile, type Profile } from "../src/lib/comply/payments-engine";
import { applicableOb, type DLState } from "../src/lib/comply/digital-engine";

const st = seedState();
const pay = st.programmes.find((p) => p.id === "payments")!;
const dl = st.programmes.find((p) => p.id === "digital_lending")!;
let checked = 0;
let bad = 0;

const yn = ["yes", "no"];
// ---- Payments: every combination of the nine questions that a real profile can produce
for (const pso of yn) for (const psp of yn) for (const emi of yn) for (const agents of yn) for (const cards of yn)
for (const participant of yn) for (const fimdi of yn) for (const safeguard of ["trust", "special", ""]) {
  if (emi === "yes" && psp === "no") continue; // an EMI is a payment service provider
  if (emi === "yes" && !safeguard) continue; // EMI must declare how funds are safeguarded
  if (emi === "no" && safeguard) continue;
  const p: Profile = blankProfile();
  p.categories.pso = pso === "yes"; p.categories.psp = psp === "yes";
  p.pspClasses = emi === "yes" ? ["emi"] : [];
  p.agents = agents === "yes"; p.cards = cards === "yes"; p.participant = participant === "yes";
  p.fiMdi = emi === "yes" ? fimdi === "yes" : fimdi === "yes";
  p.safeguard = (safeguard || null) as Profile["safeguard"];
  const real = applicableEntries(p).map((e) => e.id).sort().join(",");
  const ours = universe(pay, { pso, psp, emi, instrument: "no", agents, cards, participant, fimdi, safeguard }).map((o) => o.id).sort().join(",");
  checked++;
  if (real !== ours) { bad++; if (bad < 5) console.log("PAYMENTS MISMATCH", { pso, psp, emi, agents, cards, participant, fimdi, safeguard }, real.length, ours.length); }
}

// ---- Digital lending: route x five conditional answers x wire occurrence
const ans = ["yes", "no", "not-sure", ""];
for (const route of ["ml", "ndt"]) for (const collateral of ans) for (const custody of ans) for (const recovery of ans)
for (const advice of ans) for (const crossborder of ans) for (const wire of yn) {
  const state = {
    profile: { route, collateral, custody, recovery, advice, crossborder },
    occurrences: wire === "yes" ? [{ eventId: "wire" }] : [],
  } as unknown as DLState;
  // the real engine's source list is the same JSON the seed was built from
  const realIds = (require("../src/data/digital-lending/obligations.json") as Array<Record<string, any>>)
    .filter((o) => applicableOb(state, o as any)).map((o) => o.ID).sort().join(",");
  const ours = universe(dl, { route, collateral, custody, recovery, advice, crossborder, wire }).map((o) => o.id).sort().join(",");
  checked++;
  if (realIds !== ours) { bad++; if (bad < 5) console.log("DL MISMATCH", { route, collateral, custody, recovery, advice, crossborder, wire }); }
}

console.log(`${checked} profiles compared, ${bad} differences`);
process.exit(bad ? 1 : 0);
