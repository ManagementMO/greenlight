"use client";

// Home: ask a question and attach the paperwork. Styled with the /landing design
// system (dark, Lora headlines, mono labels, glass cards), scoped under `.ah`.
// Files stay in the browser; nothing here reads or uploads them yet.

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { animate, stagger } from "animejs";
import { Icon } from "@/components/icons";
import { DEMO_BOOKS, DEMO_CASES, type DemoCase } from "@/lib/demo-cases";
import "./ask-home.css";

const Gradient = dynamic(() => import("@/app/landing/gradient-background"), { ssr: false });

type Kind = "contract" | "ledger" | "invoice" | "email" | "other";

export type Attachment = { id: string; name: string; size: number; kind: Kind; sample?: boolean; file?: File };

const SLOTS: { kind: Exclude<Kind, "other">; title: string; hint: string }[] = [
  { kind: "contract", title: "Contract", hint: "Payment schedule, milestones" },
  { kind: "ledger", title: "Bank or ledger", hint: "CSV, XLSX, QuickBooks export" },
  { kind: "invoice", title: "Invoices and bills", hint: "What's owed, and when" },
  { kind: "email", title: "Emails and quotes", hint: "Promised dates, supplier quotes" },
];

const SUGGESTIONS = [
  "Can I take a $120k job without missing payroll?",
  "When does my cash hit its lowest point?",
  "How big a deposit should I ask for?",
];

// The Ductline sample's sources, as the files a business owner would have.
const SAMPLE_FILES: Attachment[] = [
  { id: "s1", name: "C-120 clinic retrofit contract.pdf", size: 184_320, kind: "contract", sample: true },
  { id: "s2", name: "bank-ledger-oct.csv", size: 41_984, kind: "ledger", sample: true },
  { id: "s3", name: "supplier and crew budget.xlsx", size: 22_528, kind: "invoice", sample: true },
  { id: "s4", name: "Customer AP settlement windows.eml", size: 6_144, kind: "email", sample: true },
];

const ACCEPT = ".json,.pdf,.csv,.tsv,.txt,.md,.eml,.html,.xml,.xlsx,.xls,.docx";

function classify(name: string): Kind {
  const n = name.toLowerCase();
  if (/contract|agreement|\bsow\b|proposal|change.?order/.test(n)) return "contract";
  if (/bank|ledger|statement|transaction|payroll|books|quickbooks|upload|\.(csv|ofx|qbo|json)$/.test(n)) return "ledger";
  if (/invoice|bill|receipt|budget|terms|\.xlsx?$/.test(n)) return "invoice";
  if (/email|quote|\.(eml|msg)$/.test(n)) return "email";
  return "other";
}

function size(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AskHome({ onSubmit, onOpenSample, busy = false, error = null }: {
  onSubmit: (question: string, files: Attachment[]) => void;
  onOpenSample: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  const root = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const pickKind = useRef<Kind | null>(null);
  const [question, setQuestion] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loadingCase, setLoadingCase] = useState<string | null>(null);
  const [caseError, setCaseError] = useState<string | null>(null);
  const [casesOpen, setCasesOpen] = useState(false);
  const casesRef = useRef<HTMLDivElement>(null);
  const activeCase = DEMO_CASES.find((c) => files.some((f) => f.id.startsWith(`${c.id}-`)));

  // Close the demo-case dropdown on outside click or Escape.
  useEffect(() => {
    if (!casesOpen) return;
    const onDown = (e: MouseEvent) => { if (!casesRef.current?.contains(e.target as Node)) setCasesOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setCasesOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [casesOpen]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    el.classList.add("ah-ready");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("ah-still");
      return;
    }
    const a = animate(el.querySelectorAll("[data-ah-char]"), {
      opacity: [0, 1],
      rotateY: [-95, 0],
      z: [-200, 0],
      filter: ["blur(14px)", "blur(0px)"],
      duration: 1300,
      delay: stagger(40),
      ease: "outExpo",
    });
    const b = animate(el.querySelectorAll("[data-ah-fade]"), {
      opacity: [0, 1],
      y: [24, 0],
      duration: 1000,
      delay: stagger(110, { start: 600 }),
      ease: "outExpo",
    });
    return () => { a.revert(); b.revert(); };
  }, []);

  function add(list: FileList | null, kind: Kind | null = null) {
    if (!list?.length) return;
    const next = [...list].map((f) => ({
      id: `${f.name}-${f.size}-${f.lastModified}`,
      name: f.name,
      size: f.size,
      kind: kind ?? classify(f.name),
      file: f,
    }));
    setFiles((cur) => [...cur.filter((x) => !x.sample && !next.some((n) => n.id === x.id)), ...next]);
  }

  function pick(kind: Kind | null) {
    pickKind.current = kind;
    picker.current?.click();
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    add(e.dataTransfer.files);
  }

  // Load a demo case: the Birchfield books plus that case's documents, fetched as real files, and its question.
  async function loadCase(c: DemoCase) {
    setLoadingCase(c.id);
    setCaseError(null);
    try {
      const list = await Promise.all([DEMO_BOOKS, ...c.files].map(async (name) => {
        const res = await fetch(`/api/demo-files?name=${encodeURIComponent(name)}`);
        if (!res.ok) throw new Error(`Couldn't load ${name}`);
        const file = new File([await res.blob()], name.split("/").pop()!, { type: res.headers.get("content-type") ?? "" });
        return { id: `${c.id}-${name}`, name: file.name, size: file.size, kind: classify(file.name), file };
      }));
      setFiles(list);
      setQuestion(c.question);
    } catch (e) {
      setCaseError(e instanceof Error ? e.message : "Couldn't load the demo files.");
    } finally {
      setLoadingCase(null);
    }
  }

  function useSample() {
    setQuestion(SUGGESTIONS[0]);
    setFiles(SAMPLE_FILES);
  }

  const ready = question.trim().length > 0 && !busy;
  const submit = () => ready && onSubmit(question.trim(), files);

  return (
    <div
      className={`ah${dragging ? " is-dragging" : ""}`}
      ref={root}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={onDrop}
    >
      <div className="ah-bg" aria-hidden="true">
        <Gradient colors={["#0b8a63", "#5b48c9", "#101412"]} />
      </div>

      <header className="ah-nav">
        <span className="ah-brand">Headroom</span>
        <nav>
          <button type="button" onClick={onOpenSample}>Sample workspace</button>
          <a href="/">How it works</a>
        </nav>
      </header>

      <main className="ah-main">
        <h1 aria-label="What are you deciding?">
          {"What are you deciding?".split(" ").map((w, i) => (
            <span key={i} className="ah-word">
              {[...w].map((c, j) => <span key={j} className="ah-char" data-ah-char>{c}</span>)}
            </span>
          ))}
        </h1>
        <p className="ah-sub" data-ah-fade>
          Ask in plain words and add the paperwork. The model reads your documents; tested code does every dollar and date.
        </p>

        <form
          className="ah-composer"
          data-ah-fade
          onSubmit={(e) => { e.preventDefault(); submit(); }}
        >
          <label htmlFor="ah-question" className="ah-visually-hidden">Your question</label>
          <textarea
            id="ah-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }}
            placeholder="e.g. A clinic offered us a $120k retrofit. Can we take it without missing payroll in November?"
            rows={3}
          />

          {files.length > 0 && (
            <ul className="ah-files" aria-label="Attached files">
              {files.map((f) => (
                <li key={f.id} className={`is-${f.kind}`}>
                  <Icon name="document" size={14} />
                  <span className="ah-file-name">{f.name}</span>
                  <span className="ah-file-meta">{f.sample ? "sample" : size(f.size)}</span>
                  <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((cur) => cur.filter((x) => x.id !== f.id))}>
                    <Icon name="close" size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="ah-composer-bar">
            <button type="button" className="ah-attach" onClick={() => pick(null)}>
              <Icon name="link" size={15} /> Attach files
            </button>
            <span className="ah-kbd">⌘ Enter</span>
            <button type="submit" className="ah-send" disabled={!ready}>
              {busy ? "Reading your files…" : <>Check it <Icon name="arrow-right" size={15} /></>}
            </button>
          </div>

          <div className="ah-drop" aria-hidden="true">Drop files to attach</div>
        </form>

        {error && <p className="ah-error" role="alert">{error}</p>}
        {files.length > 0 && !files.some((f) => f.sample) && !files.some((f) => /\.json$/i.test(f.name)) && (
          <p className="ah-warn">No accounting books attached, so Headroom won&apos;t know your bank balance. Add the .json export too, or say how much is in the bank.</p>
        )}

        <div className="ah-suggest" data-ah-fade>
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => setQuestion(s)}>{s}</button>
          ))}
        </div>

        <section className="ah-slots" data-ah-fade aria-label="Documents to add">
          <div className="ah-slots-head">
            <p className="ah-eyebrow">What to add</p>
            <button type="button" onClick={useSample}>Try it with sample files →</button>
          </div>
          <div className="ah-slots-row">
            {SLOTS.map((slot) => {
              const n = files.filter((f) => f.kind === slot.kind).length;
              return (
                <button key={slot.kind} type="button" className={`ah-slot is-${slot.kind}${n ? " is-filled" : ""}`} onClick={() => pick(slot.kind)}>
                  <span className="ah-slot-state">{n ? <><Icon name="check" size={13} /> {n} added</> : "+ Add"}</span>
                  <b>{slot.title}</b>
                  <span>{slot.hint}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="ah-cases" data-ah-fade aria-label="Demo cases">
          <div className="ah-slots-head">
            <p className="ah-eyebrow">Demo cases · real uploads</p>
            <span>Loads the Birchfield books, the case&apos;s files and its question. Then press Check it.</span>
          </div>
          {/* One dropdown: each option shows the case, how many files it attaches, and what Headroom should answer. */}
          <div className={`ah-select${casesOpen ? " is-open" : ""}`} ref={casesRef}>
            <button
              type="button"
              className="ah-select-trigger"
              aria-haspopup="listbox"
              aria-expanded={casesOpen}
              disabled={!!loadingCase || busy}
              onClick={() => setCasesOpen((v) => !v)}
            >
              {activeCase || loadingCase ? (
                <span className="ah-option-body">
                  <b>{loadingCase ? `Loading ${DEMO_CASES.find((c) => c.id === loadingCase)?.title}…` : activeCase!.title}</b>
                  {activeCase && !loadingCase && <span>{activeCase.group} · {activeCase.files.length + 1} files</span>}
                  {activeCase && !loadingCase && <em>{activeCase.expect}</em>}
                </span>
              ) : (
                <span className="ah-option-body"><b>Choose a demo case</b><span>{DEMO_CASES.length} cases · each loads its files and question</span></span>
              )}
              <Icon name="chevron-down" size={16} />
            </button>
            {casesOpen && (
              <div className="ah-select-panel" role="listbox" aria-label="Demo cases">
                {(["Happy path", "Tough call", "Edge case"] as const).map((group) => (
                  <div key={group} role="group" aria-label={group}>
                    <p className="ah-select-group">{group}</p>
                    {DEMO_CASES.filter((c) => c.group === group).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        role="option"
                        aria-selected={activeCase?.id === c.id}
                        className={`ah-option${activeCase?.id === c.id ? " is-on" : ""}`}
                        onClick={() => { setCasesOpen(false); loadCase(c); }}
                      >
                        <span className="ah-option-body"><b>{c.title}</b><em>{c.expect}</em></span>
                        <span className="ah-option-files">{c.files.length + 1} files</span>
                        {activeCase?.id === c.id && <Icon name="check" size={14} />}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          {caseError && <p className="ah-error" role="alert">{caseError}</p>}
        </section>

        <p className="ah-note" data-ah-fade>
          Books (.json) are read by fixed code. Contracts, emails and other documents are read by Claude. Sample files open the synthetic Ductline demo.
        </p>
      </main>

      <input
        ref={picker}
        type="file"
        multiple
        accept={ACCEPT}
        hidden
        onChange={(e) => { add(e.target.files, pickKind.current); e.target.value = ""; }}
      />
    </div>
  );
}
