"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, AlertTriangle, Ban, PauseCircle, MessageSquarePlus, ListPlus, Download, Star, Send } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Progress, Input, Textarea, Select, Label, EmptyState } from "@/components/ui";
import { StatusBadge, DocStatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
import type { SupplierStatus, DocumentStatus } from "@prisma/client";
import {
  changeStatusAction, requestInfoAction, addNoteAction, addEvaluationAction, addToShortlistAction, verifyDocumentAction,
} from "./actions";

/* eslint-disable @typescript-eslint/no-explicit-any */
type S = any;

const TABS = ["Overview", "Products", "Services", "Brands", "Documents", "Locations", "Terms", "Evaluation", "Notes", "Activity"] as const;

export function SupplierProfile({ supplier, perms, shortlists, requiredDocs }: {
  supplier: S;
  perms: Record<string, boolean>;
  shortlists: { id: string; name: string }[];
  docTypes: string[];
  requiredDocs: { code: string; nameEn: string; mandatory: boolean; provided: boolean }[];
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [dialog, setDialog] = useState<null | "reject" | "conditional" | "requestInfo" | "shortlist">(null);
  const router = useRouter();
  const [pending, start] = useTransition();

  const doStatus = (key: string, reason?: string) => start(async () => { await changeStatusAction(supplier.id, key, reason); router.refresh(); });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-lg bg-accent text-lg font-bold text-accent-foreground">
            {supplier.companyNameEn.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{supplier.companyNameEn}</h1>
            <div className="text-sm text-muted-foreground" dir="rtl">{supplier.companyNameAr}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono text-muted-foreground">{supplier.supplierCode}</span>
              <StatusBadge status={supplier.status as SupplierStatus} />
              {supplier.rating != null && <span className="flex items-center gap-1 text-muted-foreground"><Star className="h-3.5 w-3.5" /> {supplier.rating.toFixed(1)}</span>}
              <span className="text-muted-foreground">Profile {supplier.completeness}%</span>
            </div>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex flex-wrap gap-2">
          {perms.approve && <Button size="sm" variant="success" disabled={pending} onClick={() => doStatus("approve")}><CheckCircle2 className="h-4 w-4" /> Approve</Button>}
          {perms.approve && <Button size="sm" variant="outline" disabled={pending} onClick={() => setDialog("conditional")}><AlertTriangle className="h-4 w-4" /> Conditional</Button>}
          {perms.reject && <Button size="sm" variant="danger" disabled={pending} onClick={() => setDialog("reject")}><XCircle className="h-4 w-4" /> Reject</Button>}
          {perms.requestInfo && <Button size="sm" variant="outline" disabled={pending} onClick={() => setDialog("requestInfo")}><Send className="h-4 w-4" /> Request info</Button>}
          {perms.suspend && <Button size="sm" variant="outline" disabled={pending} onClick={() => { if (confirm("Suspend this supplier?")) doStatus("suspend"); }}><PauseCircle className="h-4 w-4" /> Suspend</Button>}
          {perms.suspend && <Button size="sm" variant="outline" disabled={pending} onClick={() => { if (confirm("Blacklist this supplier? This is a strong action.")) doStatus("blacklist"); }}><Ban className="h-4 w-4" /> Blacklist</Button>}
          {perms.shortlist && <Button size="sm" variant="outline" onClick={() => setDialog("shortlist")}><ListPlus className="h-4 w-4" /> Shortlist</Button>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto scrollbar-thin border-b border-border">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && <Overview supplier={supplier} requiredDocs={requiredDocs} />}
      {tab === "Products" && <ProductsTab products={supplier.products} />}
      {tab === "Services" && <ServicesTab services={supplier.services} />}
      {tab === "Brands" && <BrandsTab brands={supplier.brands} />}
      {tab === "Documents" && <DocumentsTab supplierId={supplier.id} documents={supplier.documents} canVerify={perms.approve} />}
      {tab === "Locations" && <LocationsTab locations={supplier.locations} />}
      {tab === "Terms" && <TermsTab terms={supplier.commercialTerms} />}
      {tab === "Evaluation" && <EvaluationTab supplierId={supplier.id} evaluations={supplier.evaluations} canEvaluate={perms.evaluate} />}
      {tab === "Notes" && <NotesTab supplierId={supplier.id} notes={supplier.notes} canAdd={perms.notes} />}
      {tab === "Activity" && <ActivityTab activity={supplier.activity} history={supplier.statusHistory} />}

      {/* Dialogs */}
      {dialog === "reject" && <ReasonDialog title="Reject supplier" label="Reason for rejection" onClose={() => setDialog(null)} onSubmit={(r) => { doStatus("reject", r); setDialog(null); }} />}
      {dialog === "conditional" && <ReasonDialog title="Conditional approval" label="Conditions" onClose={() => setDialog(null)} onSubmit={(r) => { doStatus("conditional", r); setDialog(null); }} />}
      {dialog === "requestInfo" && <RequestInfoDialog supplierId={supplier.id} requiredDocs={requiredDocs} onClose={() => setDialog(null)} />}
      {dialog === "shortlist" && <ShortlistDialog supplierId={supplier.id} shortlists={shortlists} onClose={() => setDialog(null)} />}
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────

function Overview({ supplier, requiredDocs }: { supplier: S; requiredDocs: { nameEn: string; mandatory: boolean; provided: boolean }[] }) {
  const fields: [string, unknown][] = [
    ["CR Number", supplier.crNumber], ["VAT Number", supplier.vatNumber], ["IBAN", supplier.iban],
    ["Company Type", supplier.companyType], ["Established", supplier.yearEstablished], ["Employees", supplier.employeeCount],
    ["City", supplier.city], ["Country", supplier.country], ["Website", supplier.website],
    ["Phone", supplier.primaryPhone], ["Account", supplier.ownerEmail],
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Company details</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {fields.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="text-sm font-medium">{(v as string) || "—"}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4">
            <div className="text-xs text-muted-foreground">Supplier types</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {supplier.supplierTypes.length ? supplier.supplierTypes.map((t: string) => <Badge key={t} tone="info">{t.replace(/_/g, " ")}</Badge>) : "—"}
            </div>
          </div>
          <div className="mt-4">
            <div className="text-xs text-muted-foreground">Categories</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {supplier.categories.length ? supplier.categories.map((c: string) => <Badge key={c} tone="neutral">{c}</Badge>) : "—"}
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1 text-xs text-muted-foreground">Contacts</div>
            <ul className="space-y-1 text-sm">
              {supplier.contacts.map((c: S) => (
                <li key={c.id}>{c.name}{c.jobTitle ? ` — ${c.jobTitle}` : ""} · {[c.email, c.mobile].filter(Boolean).join(" · ")}</li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Qualification</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="mb-1 flex justify-between text-sm"><span>Profile completeness</span><span>{supplier.completeness}%</span></div>
            <Progress value={supplier.completeness} />
          </div>
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Required documents</div>
            <ul className="space-y-1 text-sm">
              {requiredDocs.map((r) => (
                <li key={r.nameEn} className="flex items-center gap-2">
                  {r.provided ? <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" /> : <XCircle className="h-4 w-4 text-[hsl(var(--danger))]" />}
                  {r.nameEn}{r.mandatory ? " *" : ""}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ProductsTab({ products }: { products: S[] }) {
  if (!products.length) return <EmptyState title="No products" />;
  return (
    <Card><CardContent className="p-0">
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-xs text-muted-foreground">
            <th className="p-3 text-start font-medium">Product</th><th className="p-3 text-start font-medium">Brand</th>
            <th className="p-3 text-start font-medium">SKU</th><th className="p-3 text-start font-medium">Category</th><th className="p-3 text-start font-medium">Source</th>
          </tr></thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="p-3 font-medium">{p.nameEn}</td><td className="p-3">{p.brand ?? "—"}</td>
                <td className="p-3">{p.sku ?? "—"}</td><td className="p-3">{p.category ?? "—"}</td>
                <td className="p-3">{p.source === "AI" ? <Badge tone="info">AI</Badge> : <Badge tone="neutral">Manual</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CardContent></Card>
  );
}

function ServicesTab({ services }: { services: S[] }) {
  if (!services.length) return <EmptyState title="No services" />;
  return <div className="grid gap-3 sm:grid-cols-2">{services.map((s) => (
    <Card key={s.id}><CardContent className="pt-5">
      <div className="font-medium">{s.name}</div>
      <div className="text-sm text-muted-foreground">{s.category ?? "—"}{s.sla ? ` · SLA ${s.sla}` : ""}</div>
      {s.citiesCovered?.length > 0 && <div className="mt-2 text-xs text-muted-foreground">Cities: {s.citiesCovered.join(", ")}</div>}
    </CardContent></Card>
  ))}</div>;
}

function BrandsTab({ brands }: { brands: S[] }) {
  if (!brands.length) return <EmptyState title="No brands" />;
  return <div className="flex flex-wrap gap-2">{brands.map((b, i) => (
    <div key={i} className="rounded-md border border-border bg-card px-3 py-2 text-sm">
      <span className="font-medium">{b.name}</span> <span className="text-muted-foreground">· {b.relationship}{b.country ? ` · ${b.country}` : ""}</span>
    </div>
  ))}</div>;
}

function LocationsTab({ locations }: { locations: S[] }) {
  if (!locations.length) return <EmptyState title="No coverage locations" />;
  return <div className="grid gap-3 sm:grid-cols-3">{locations.map((l) => (
    <Card key={l.id}><CardContent className="pt-5">
      <div className="font-medium">{[l.city, l.region].filter(Boolean).join(", ") || l.country}</div>
      <div className="text-sm text-muted-foreground">{l.country}</div>
    </CardContent></Card>
  ))}</div>;
}

function TermsTab({ terms }: { terms: S }) {
  if (!terms) return <EmptyState title="No commercial terms provided" />;
  const rows: [string, unknown][] = [
    ["Payment Terms", terms.paymentTerms], ["Credit Days", terms.creditDays], ["Minimum Order", terms.minimumOrder],
    ["Delivery Lead Time", terms.deliveryLeadTime], ["Delivery Capability", terms.deliveryCapability ? "Yes" : "No"],
    ["Warehouse", terms.warehouseAvailable ? "Yes" : "No"], ["Fleet", terms.fleetAvailable ? "Yes" : "No"], ["Import", terms.importCapability ? "Yes" : "No"],
  ];
  return <Card><CardContent className="pt-5"><dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
    {rows.map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="text-sm font-medium">{(v as string) ?? "—"}</dd></div>)}
  </dl></CardContent></Card>;
}

function DocumentsTab({ supplierId, documents, canVerify }: { supplierId: string; documents: S[]; canVerify: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!documents.length) return <EmptyState title="No documents uploaded" />;
  return (
    <Card><CardContent className="p-0">
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-xs text-muted-foreground">
            <th className="p-3 text-start font-medium">Document</th><th className="p-3 text-start font-medium">Expiry</th>
            <th className="p-3 text-start font-medium">Status</th><th className="p-3"></th>
          </tr></thead>
          <tbody>
            {documents.map((d) => (
              <tr key={d.id} className="border-b border-border last:border-0">
                <td className="p-3"><div className="font-medium">{d.typeName}</div><div className="text-xs text-muted-foreground">{d.fileName}</div></td>
                <td className="p-3">{formatDate(d.expiryDate)}</td>
                <td className="p-3"><DocStatusBadge status={d.status as DocumentStatus} /></td>
                <td className="p-3">
                  <div className="flex justify-end gap-1">
                    <a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer" className="rounded p-1.5 text-muted-foreground hover:bg-muted"><Download className="h-4 w-4" /></a>
                    {canVerify && d.rawStatus === "PENDING_VERIFICATION" && (
                      <>
                        <button disabled={pending} onClick={() => start(async () => { await verifyDocumentAction(supplierId, d.id, true); router.refresh(); })} className="rounded p-1.5 text-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/10"><CheckCircle2 className="h-4 w-4" /></button>
                        <button disabled={pending} onClick={() => { const r = prompt("Rejection reason?") ?? undefined; start(async () => { await verifyDocumentAction(supplierId, d.id, false, r); router.refresh(); }); }} className="rounded p-1.5 text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger))]/10"><XCircle className="h-4 w-4" /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CardContent></Card>
  );
}

function EvaluationTab({ supplierId, evaluations, canEvaluate }: { supplierId: string; evaluations: S[]; canEvaluate: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [score, setScore] = useState(4);
  const [outcome, setOutcome] = useState("POSITIVE");
  const [comment, setComment] = useState("");
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {canEvaluate && (
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>Add evaluation</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Score (1-5)</Label><Input type="number" min={1} max={5} value={score} onChange={(e) => setScore(Number(e.target.value))} /></div>
            <div><Label>Outcome</Label><Select value={outcome} onChange={(e) => setOutcome(e.target.value)}><option value="POSITIVE">Positive</option><option value="NEUTRAL">Neutral</option><option value="NEGATIVE">Negative</option></Select></div>
            <div><Label>Comment</Label><Textarea value={comment} onChange={(e) => setComment(e.target.value)} /></div>
            <Button disabled={pending} onClick={() => start(async () => { await addEvaluationAction(supplierId, score, outcome, comment); setComment(""); router.refresh(); })}>Save evaluation</Button>
          </CardContent>
        </Card>
      )}
      <div className={canEvaluate ? "lg:col-span-2" : "lg:col-span-3"}>
        {evaluations.length === 0 ? <EmptyState title="No evaluations yet" /> : (
          <div className="space-y-3">
            {evaluations.map((e) => (
              <Card key={e.id}><CardContent className="pt-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Badge tone={e.outcome === "POSITIVE" ? "success" : e.outcome === "NEGATIVE" ? "danger" : "neutral"}>{e.outcome}</Badge><span className="text-sm">{e.score}/5</span></div>
                  <span className="text-xs text-muted-foreground">{e.author} · {formatDate(e.createdAt)}</span>
                </div>
                {e.comment && <p className="mt-2 text-sm text-muted-foreground">{e.comment}</p>}
              </CardContent></Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NotesTab({ supplierId, notes, canAdd }: { supplierId: string; notes: S[]; canAdd: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5 px-3 py-2 text-xs text-muted-foreground">
        Internal notes are visible to procurement only — never to the supplier.
      </div>
      {canAdd && (
        <Card><CardContent className="pt-5">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add an internal note…" />
          <Button className="mt-3" disabled={pending || !body.trim()} onClick={() => start(async () => { await addNoteAction(supplierId, body); setBody(""); router.refresh(); })}><MessageSquarePlus className="h-4 w-4" /> Add note</Button>
        </CardContent></Card>
      )}
      {notes.length === 0 ? <EmptyState title="No notes yet" /> : (
        <div className="space-y-2">{notes.map((n) => (
          <Card key={n.id}><CardContent className="pt-4">
            <p className="text-sm">{n.body}</p>
            <p className="mt-1 text-xs text-muted-foreground">{n.author} · {formatDate(n.createdAt)}</p>
          </CardContent></Card>
        ))}</div>
      )}
    </div>
  );
}

function ActivityTab({ activity, history }: { activity: S[]; history: S[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Activity log</CardTitle></CardHeader><CardContent>
        {activity.length === 0 ? <p className="text-sm text-muted-foreground">No activity.</p> : (
          <ul className="space-y-3">{activity.map((a, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
              <div><div className="font-medium">{a.action.replace(/_/g, " ")}</div>{a.detail && <div className="text-xs text-muted-foreground">{a.detail}</div>}<div className="text-xs text-muted-foreground">{a.actor} · {new Date(a.createdAt).toLocaleString()}</div></div>
            </li>
          ))}</ul>
        )}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Status history</CardTitle></CardHeader><CardContent>
        {history.length === 0 ? <p className="text-sm text-muted-foreground">No status changes.</p> : (
          <ul className="space-y-3">{history.map((h, i) => (
            <li key={i} className="text-sm">
              <span className="font-medium">{(h.from ?? "—").replace(/_/g, " ")} → {h.to.replace(/_/g, " ")}</span>
              {h.reason && <div className="text-xs text-muted-foreground">{h.reason}</div>}
              <div className="text-xs text-muted-foreground">{h.by} · {new Date(h.createdAt).toLocaleString()}</div>
            </li>
          ))}</ul>
        )}
      </CardContent></Card>
    </div>
  );
}

// ── Dialogs ───────────────────────────────────────────────────

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}

function ReasonDialog({ title, label, onClose, onSubmit }: { title: string; label: string; onClose: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Modal title={title} onClose={onClose}>
      <Label>{label}</Label>
      <Textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSubmit(reason)}>Confirm</Button>
      </div>
    </Modal>
  );
}

function RequestInfoDialog({ supplierId, requiredDocs, onClose }: { supplierId: string; requiredDocs: { code: string; nameEn: string }[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const toggle = (c: string) => setSelected((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
  return (
    <Modal title="Request information" onClose={onClose}>
      <Label>Documents to request</Label>
      <div className="mb-3 flex flex-wrap gap-2">
        {requiredDocs.map((d) => (
          <button key={d.code} onClick={() => toggle(d.code)} className={`rounded-full border px-2.5 py-1 text-xs ${selected.includes(d.code) ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{d.nameEn}</button>
        ))}
      </div>
      <Label>Message</Label>
      <Textarea value={message} onChange={(e) => setMessage(e.target.value)} />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button disabled={pending || selected.length === 0} onClick={() => start(async () => { await requestInfoAction(supplierId, selected, message); router.refresh(); onClose(); })}>Send request</Button>
      </div>
    </Modal>
  );
}

function ShortlistDialog({ supplierId, shortlists, onClose }: { supplierId: string; shortlists: { id: string; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [choice, setChoice] = useState(shortlists[0]?.id ?? "__new__");
  const [newName, setNewName] = useState("");
  return (
    <Modal title="Add to shortlist" onClose={onClose}>
      <Label>Shortlist</Label>
      <Select value={choice} onChange={(e) => setChoice(e.target.value)}>
        {shortlists.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        <option value="__new__">+ New shortlist…</option>
      </Select>
      {choice === "__new__" && <div className="mt-3"><Label>New shortlist name</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} /></div>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button disabled={pending || (choice === "__new__" && !newName.trim())} onClick={() => start(async () => { await addToShortlistAction(supplierId, choice, newName); router.refresh(); onClose(); })}>Add</Button>
      </div>
    </Modal>
  );
}
