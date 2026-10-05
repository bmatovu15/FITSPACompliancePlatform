"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  LicenceApplicationFeeTier,
  LicenceApplicationTemplate,
  LicenceApplicationWizardClass,
  MemberLicenceApplication,
  MemberLicenceApplicationFile,
  MemberLicenceApplicationItemState,
} from "@/lib/types";
import { cx } from "./pw-ui";
import {
  DetailsScreen,
  ExpertScreen,
  LandingScreen,
  ResultScreen,
  SandboxScreen,
  UnlistedScreen,
  WizardScreen,
} from "./payments-screens";
import PaymentsWorkspace, { type PackState, type ReviewState } from "./payments-workspace";
import {
  buildFeeCatalogue,
  classificationToFacts,
  classificationValid,
  derivedRoutes,
  emptyClasses,
  emptyFacts,
  pricingAssessment,
  readClassification,
  readFacts,
  routeSummaryText,
  statusFor,
  summarise,
  unresolvedQuestions,
  visibleTemplates,
  type ActivityKey,
  type Classification,
  type Ctx,
  type FactAnswers,
  type FileMap,
  type FileMeta,
  type ItemStatus,
  type Template,
} from "./payments-model";

// The Payments application: the front door (landing -> classification ->
// isn't-listed / expert / sandbox -> licence result -> application details)
// and the 58-requirement workspace, ported screen-for-screen from the Beacon
// design prototype. The prototype keeps everything in localStorage; here the
// same state lives in Supabase:
//   - member_licence_applications.facts  : classification, the ten detail
//     answers, pathwaySet, review request, application-pack stamp
//   - member_licence_application_item_state : each requirement's answers + status
//   - member_licence_application_files + storage bucket : uploads (versioned per slot)
// The anonymous application id is kept in localStorage so "Resume my
// checklist" works in the same browser.

const STORAGE_KEY = "beaconPaymentsApplicationId";
const BUCKET = "licence-application-files";

type Screen = "loading" | "landing" | "wizard" | "unlisted" | "expert" | "sandbox" | "result" | "details" | "app";

export default function PaymentsWizardClient({
  applicationKey,
  templates,
  wizardClasses,
  feeTiers,
}: {
  applicationKey: string;
  templates: LicenceApplicationTemplate[];
  wizardClasses: LicenceApplicationWizardClass[];
  feeTiers: LicenceApplicationFeeTier[];
}) {
  const supabase = useMemo(() => createClient(), []);

  const [screen, setScreen] = useState<Screen>("loading");
  const [application, setApplication] = useState<MemberLicenceApplication | null>(null);
  const [itemStates, setItemStates] = useState<Record<string, MemberLicenceApplicationItemState>>({});
  const [fileRows, setFileRows] = useState<MemberLicenceApplicationFile[]>([]);
  const [c, setC] = useState<Classification>({ classes: emptyClasses(), fundsTier: "", emiTier: "" });
  const [detailsDraft, setDetailsDraft] = useState<FactAnswers>(emptyFacts());
  const [detailsFrom, setDetailsFrom] = useState<"result" | "app">("result");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Latest application row for sequential read-modify-write of `facts`.
  const appRef = useRef<MemberLicenceApplication | null>(null);
  const creating = useRef<Promise<MemberLicenceApplication | null> | null>(null);
  const classTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const catalogue = useMemo(() => buildFeeCatalogue(wizardClasses, feeTiers), [wizardClasses, feeTiers]);
  const sortedTemplates = useMemo(() => [...templates].sort((a, b) => a.seq - b.seq), [templates]);

  // ---------------------------------------------------------------- derived
  const facts = useMemo(() => readFacts(application?.facts ?? {}), [application]);
  const pathwaySet = !!(application?.facts as any)?.pathwaySet;
  const routes = useMemo(() => derivedRoutes(c), [c]);
  const pricing = useMemo(() => pricingAssessment(c, catalogue), [c, catalogue]);

  const data = useMemo(() => {
    const out: Record<string, any> = {};
    Object.values(itemStates).forEach((r) => {
      out[r.external_id] = r.answers ?? {};
    });
    return out;
  }, [itemStates]);

  const files: FileMap = useMemo(() => {
    const out: FileMap = {};
    fileRows.forEach((f) => {
      const cur = out[f.external_id]?.[f.slot];
      if (cur && cur.version >= f.version) return;
      (out[f.external_id] ||= {})[f.slot] = {
        name: f.file_name,
        version: f.version,
        uploadedAt: f.uploaded_at,
        label: f.label || f.slot,
        slot: f.slot,
        storagePath: f.storage_path,
      };
    });
    return out;
  }, [fileRows]);

  const ctx: Ctx = useMemo(() => ({ c, routes, facts, data, files, pricing }), [c, routes, facts, data, files, pricing]);

  const visible = useMemo(() => visibleTemplates(sortedTemplates, routes, facts, pricing), [sortedTemplates, routes, facts, pricing]);

  const statuses = useMemo(() => {
    const out: Record<string, ItemStatus> = {};
    visible.forEach((t) => {
      out[t.external_id] = statusFor(t, ctx);
    });
    return out;
  }, [visible, ctx]);

  const summary = useMemo(() => {
    const unresolved = unresolvedQuestions(routes, facts).length + (routes.instrument && facts.fi_mdi === true ? 1 : 0);
    return summarise(visible, statuses, unresolved);
  }, [visible, statuses, routes, facts]);

  const review = ((application?.facts as any)?.applicationReview ?? null) as ReviewState | null;
  const pack = ((application?.facts as any)?.pack ?? null) as PackState | null;

  // ----------------------------------------------------------- persistence
  const setApp = useCallback((row: MemberLicenceApplication | null) => {
    appRef.current = row;
    setApplication(row);
  }, []);

  const ensureApplication = useCallback(
    async (initialFacts: Record<string, unknown>): Promise<MemberLicenceApplication | null> => {
      if (appRef.current) return appRef.current;
      if (creating.current) return creating.current;
      creating.current = (async () => {
        const { data: row, error } = await supabase
          .from("member_licence_applications")
          .insert({ member_id: null, application_key: applicationKey, class_key: null, facts: initialFacts, status: "draft" })
          .select("*")
          .single();
        creating.current = null;
        if (error || !row) {
          console.error("Failed to start application", error);
          setErrorMsg("We couldn't start your application. Please try again.");
          return null;
        }
        try {
          localStorage.setItem(STORAGE_KEY, (row as MemberLicenceApplication).id);
        } catch {
          // private mode etc. -- just no resume across reloads
        }
        setApp(row as MemberLicenceApplication);
        return row as MemberLicenceApplication;
      })();
      return creating.current;
    },
    [supabase, applicationKey, setApp]
  );

  const persistFacts = useCallback(
    async (patch: Record<string, unknown>): Promise<void> => {
      const cur = appRef.current ?? (await ensureApplication(patch));
      if (!cur) return;
      const nextFacts = { ...cur.facts, ...patch };
      setApp({ ...cur, facts: nextFacts });
      const { error } = await supabase.from("member_licence_applications").update({ facts: nextFacts }).eq("id", cur.id);
      if (error) {
        console.error("Failed to save application facts", error);
        setErrorMsg("We couldn't save that. Please try again.");
      }
    },
    [supabase, ensureApplication, setApp]
  );

  const upsertItem = useCallback(
    async (externalId: string, answers: any, status: ItemStatus): Promise<boolean> => {
      const app = appRef.current;
      if (!app) return false;
      setItemStates((s) => ({
        ...s,
        [externalId]: {
          id: s[externalId]?.id ?? "",
          application_id: app.id,
          external_id: externalId,
          answers,
          status,
          updated_at: new Date().toISOString(),
        },
      }));
      const { data: row, error } = await supabase
        .from("member_licence_application_item_state")
        .upsert({ application_id: app.id, external_id: externalId, answers, status }, { onConflict: "application_id,external_id" })
        .select("*")
        .single();
      if (error) {
        console.error("Failed to save requirement", error);
        setErrorMsg("We couldn't save that. Please try again.");
        return false;
      }
      if (row) setItemStates((s) => ({ ...s, [externalId]: row as MemberLicenceApplicationItemState }));
      return true;
    },
    [supabase]
  );

  // ----------------------------------------------------------------- resume
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let id: string | null = null;
      try {
        id = localStorage.getItem(STORAGE_KEY);
      } catch {
        id = null;
      }
      if (!id) {
        if (!cancelled) setScreen("landing");
        return;
      }
      const { data: row, error } = await supabase.from("member_licence_applications").select("*").eq("id", id).maybeSingle();
      if (cancelled) return;
      if (error || !row) {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          // ignore
        }
        setScreen("landing");
        return;
      }
      const app = row as MemberLicenceApplication;
      const [{ data: stateRows }, { data: fRows }] = await Promise.all([
        supabase.from("member_licence_application_item_state").select("*").eq("application_id", app.id),
        supabase.from("member_licence_application_files").select("*").eq("application_id", app.id),
      ]);
      if (cancelled) return;
      setApp(app);
      setC(readClassification(app.facts ?? {}));
      setItemStates(Object.fromEntries(((stateRows ?? []) as MemberLicenceApplicationItemState[]).map((r) => [r.external_id, r])));
      setFileRows((fRows ?? []) as MemberLicenceApplicationFile[]);
      setScreen("landing");
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, setApp]);

  // Keep the stored per-item status in step with the computed status (it
  // depends on other items, facts and files, not only on the item itself).
  const syncing = useRef(false);
  useEffect(() => {
    if (screen !== "app" || syncing.current || !appRef.current) return;
    const stale = visible.filter((t) => itemStates[t.external_id] && itemStates[t.external_id].status !== statuses[t.external_id]);
    if (!stale.length) return;
    syncing.current = true;
    (async () => {
      for (const t of stale) await upsertItem(t.external_id, itemStates[t.external_id].answers ?? {}, statuses[t.external_id]);
      syncing.current = false;
    })();
  }, [screen, visible, statuses, itemStates, upsertItem]);

  // ------------------------------------------------------- classification
  function toggleClass(key: ActivityKey) {
    setC((cur) => {
      const on = !cur.classes[key];
      return {
        classes: { ...cur.classes, [key]: on },
        fundsTier: key === "funds_transfer" && !on ? "" : cur.fundsTier,
        emiTier: key === "emi" && !on ? "" : cur.emiTier,
      };
    });
  }

  // Persist the classification (debounced) once an application exists.
  useEffect(() => {
    if (screen !== "wizard" || !appRef.current) return;
    if (classTimer.current) clearTimeout(classTimer.current);
    classTimer.current = setTimeout(() => {
      persistFacts(classificationToFacts(c));
    }, 400);
    return () => {
      if (classTimer.current) clearTimeout(classTimer.current);
    };
  }, [c, screen, persistFacts]);

  async function seeLicence() {
    if (!classificationValid(c)) return;
    if (classTimer.current) clearTimeout(classTimer.current);
    await persistFacts(classificationToFacts(c));
    setScreen("result");
  }

  // ---------------------------------------------------------------- details
  function openDetails(from: "result" | "app") {
    setDetailsFrom(from);
    setDetailsDraft({ ...facts });
    setScreen("details");
  }

  async function generateChecklist() {
    await persistFacts({ ...detailsDraft, pathwaySet: true });
    setScreen("app");
  }

  // ------------------------------------------------------------ workspace
  const patchFacts = useCallback(
    async (patch: Partial<FactAnswers>) => {
      await persistFacts(patch as Record<string, unknown>);
    },
    [persistFacts]
  );

  function newCtx(t: Template, nextData: any, factsPatch?: Partial<FactAnswers>): Ctx {
    const f = factsPatch ? { ...facts, ...factsPatch } : facts;
    const r = routes;
    return { ...ctx, facts: f, routes: r, data: { ...ctx.data, [t.external_id]: nextData } };
  }

  async function saveItem(t: Template, next: any, factsPatch?: Partial<FactAnswers>) {
    if (factsPatch && Object.keys(factsPatch).length) await persistFacts(factsPatch as Record<string, unknown>);
    const status = statusFor(t, newCtx(t, next, factsPatch));
    await upsertItem(t.external_id, next, status);
  }

  async function markReviewUpdated() {
    const cur = appRef.current;
    const r = (cur?.facts as any)?.applicationReview;
    if (!r) return;
    await persistFacts({ applicationReview: { ...r, updatedAfterRequest: true, updatedAt: new Date().toISOString() } });
  }

  async function uploadFile(t: Template, slot: string, label: string, file: File) {
    const app = appRef.current;
    if (!app) return;
    const id = t.external_id;
    const prev = files[id]?.[slot];
    const version = prev ? prev.version + 1 : 1;
    const safe = (s: string) => s.replace(/[^\w.\-]+/g, "_");
    const path = `${app.id}/${safe(id)}/${safe(slot)}-v${version}-${Date.now()}-${safe(file.name)}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
    if (upErr) {
      console.error("Failed to upload file", upErr);
      setErrorMsg("That file couldn't be uploaded. Please try again.");
      return;
    }
    const base = { application_id: app.id, external_id: id, slot, file_name: file.name, storage_path: path, version };
    let res = await supabase.from("member_licence_application_files").insert({ ...base, label }).select("*").single();
    if (res.error) {
      // Environments without the optional `label` column (migration 0205).
      res = await supabase.from("member_licence_application_files").insert(base).select("*").single();
    }
    if (res.error || !res.data) {
      console.error("Failed to record uploaded file", res.error);
      setErrorMsg("That file uploaded, but we couldn't record it. Please try again.");
      return;
    }
    const row = { ...(res.data as MemberLicenceApplicationFile), label: (res.data as any).label ?? label };
    const nextRows = [...fileRows, row];
    setFileRows(nextRows);
    setErrorMsg(null);

    // Recompute this item's status with the new file included.
    const nextFiles: FileMap = { ...files, [id]: { ...(files[id] ?? {}) } };
    nextFiles[id][slot] = {
      name: row.file_name,
      version: row.version,
      uploadedAt: row.uploaded_at,
      label: row.label || slot,
      slot,
      storagePath: row.storage_path,
    };
    const answers = data[id] ?? {};
    const status = statusFor(t, { ...ctx, files: nextFiles });
    await upsertItem(id, answers, status);
    await markReviewUpdated();
  }

  async function viewFile(meta: FileMeta) {
    const { data: signed, error } = await supabase.storage.from(BUCKET).createSignedUrl(meta.storagePath, 60);
    if (error || !signed?.signedUrl) {
      console.error("Failed to sign file url", error);
      return;
    }
    window.open(signed.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function postSupport(body: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await fetch("/api/expert-support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceModule: "apply", applicationKey, ...body }),
      });
      return res.ok;
    } catch (err) {
      console.error("Expert support request failed", err);
      return false;
    }
  }

  async function sendInquiry(text: string): Promise<boolean> {
    setErrorMsg(null);
    const ok = await postSupport({
      contextKey: "payments-application",
      requestType: "question",
      contextLabel: `Payments application · ${summary.pct}% ready`,
      message: text,
    });
    if (!ok) setErrorMsg("We couldn't send that question. Please try again.");
    return ok;
  }

  async function requestReview() {
    const r: ReviewState = {
      status: "requested",
      type: summary.complete ? "final" : "interim",
      requestedAt: new Date().toISOString(),
      requestedProgress: summary.pct,
      updatedAfterRequest: false,
    };
    await persistFacts({ applicationReview: r });
    void postSupport({
      contextKey: "payments-application",
      requestType: "application_review",
      contextLabel: `Payments application · ${r.type} review · ${summary.pct}% ready`,
      message: `Application review requested at ${summary.pct}% progress (${summary.ready}/${summary.total} requirements ready).`,
    });
  }

  async function cancelReview() {
    await persistFacts({ applicationReview: null });
  }

  async function buildPack() {
    const allFiles = Object.values(files).reduce((n, m) => n + Object.keys(m).length, 0);
    await persistFacts({ pack: { builtAt: new Date().toLocaleString(), fileCount: allFiles } });
  }

  function restart() {
    if (!window.confirm("This clears your route selections and every status you have set. Continue?")) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setApp(null);
    setItemStates({});
    setFileRows([]);
    setC({ classes: emptyClasses(), fundsTier: "", emiTier: "" });
    setDetailsDraft(emptyFacts());
    setErrorMsg(null);
    setScreen("landing");
    window.scrollTo(0, 0);
  }

  const go = (s: Screen) => {
    setScreen(s);
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  };

  // ----------------------------------------------------------------- render
  let body: React.ReactNode;
  switch (screen) {
    case "loading":
      body = <div className={cx("wizard-wrap")}>Loading…</div>;
      break;
    case "landing":
      body = <LandingScreen canResume={pathwaySet} onStart={() => go("wizard")} onResume={() => go("app")} />;
      break;
    case "wizard":
      body = (
        <WizardScreen
          c={c}
          onToggle={toggleClass}
          onFundsTier={(v) => setC((cur) => ({ ...cur, fundsTier: v }))}
          onEmiTier={(v) => setC((cur) => ({ ...cur, emiTier: v }))}
          onBack={() => go("landing")}
          onUnlisted={() => go("unlisted")}
          onSee={seeLicence}
        />
      );
      break;
    case "unlisted":
      body = <UnlistedScreen onBack={() => go("wizard")} onExpert={() => go("expert")} onSandbox={() => go("sandbox")} />;
      break;
    case "expert":
      body = <ExpertScreen onBack={() => go("unlisted")} onReturn={() => go("wizard")} />;
      break;
    case "sandbox":
      body = <SandboxScreen onBack={() => go("unlisted")} onExpert={() => go("expert")} />;
      break;
    case "result":
      body = <ResultScreen c={c} pricing={pricing} hasPathway={pathwaySet} onChange={() => go("wizard")} onBuild={() => openDetails("result")} />;
      break;
    case "details":
      body = (
        <DetailsScreen
          routes={routes}
          draft={detailsDraft}
          fromApp={detailsFrom === "app"}
          pathwaySet={pathwaySet}
          onChoice={(key, value) => setDetailsDraft((d) => ({ ...d, [key]: value }))}
          onBack={() => go(detailsFrom === "app" ? "app" : "result")}
          onGenerate={generateChecklist}
          onExpert={() => go("expert")}
        />
      );
      break;
    case "app":
      body = (
        <PaymentsWorkspace
          routeSummary={routeSummaryText(c)}
          templates={sortedTemplates}
          visible={visible}
          statuses={statuses}
          ctx={ctx}
          summary={summary}
          review={review}
          pack={pack}
          onBackToResult={() => go("result")}
          onEditDetails={() => openDetails("app")}
          onChangeSelections={() => go("wizard")}
          onRestart={restart}
          onSave={saveItem}
          onSetFact={patchFacts}
          onUpload={uploadFile}
          onViewFile={viewFile}
          onRequestReview={requestReview}
          onCancelReview={cancelReview}
          onBuildPack={buildPack}
          onSendInquiry={sendInquiry}
          errorMsg={errorMsg}
        />
      );
      break;
  }

  return (
    <div className={cx("pwRoot")}>
      {errorMsg && screen !== "app" && <div className={cx("pw-error")}>{errorMsg}</div>}
      {body}
    </div>
  );
}
