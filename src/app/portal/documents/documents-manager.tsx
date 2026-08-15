"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, Trash2, Download } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select } from "@/components/ui";
import { DocStatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
import type { DocumentStatus } from "@prisma/client";
import { uploadDocumentAction, deleteDocumentAction } from "../actions";

interface Doc {
  id: string; typeName: string; fileName: string; status: DocumentStatus;
  documentNumber: string | null; issueDate: string | null; expiryDate: string | null;
}

export function DocumentsManager({ documents, docTypes }: { documents: Doc[]; docTypes: { id: string; name: string; hasExpiry: boolean }[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [typeId, setTypeId] = useState(docTypes[0]?.id ?? "");
  const hasExpiry = docTypes.find((t) => t.id === typeId)?.hasExpiry ?? true;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader><CardTitle>Upload document</CardTitle></CardHeader>
        <CardContent>
          <form
            ref={formRef}
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              start(async () => {
                const res = await uploadDocumentAction(fd);
                if (res.ok) { setError(null); formRef.current?.reset(); router.refresh(); }
                else setError(res.error ?? "Upload failed");
              });
            }}
            className="space-y-3"
          >
            <div>
              <Label>Document Type</Label>
              <Select name="documentTypeId" value={typeId} onChange={(e) => setTypeId(e.target.value)} required>
                {docTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>File (PDF, image, Office — max 15MB)</Label>
              <Input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx" required />
            </div>
            <div><Label>Document Number</Label><Input name="documentNumber" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Issue Date</Label><Input name="issueDate" type="date" /></div>
              {hasExpiry && <div><Label>Expiry Date</Label><Input name="expiryDate" type="date" /></div>}
            </div>
            {error && <p className="text-sm text-[hsl(var(--danger))]">{error}</p>}
            <Button type="submit" className="w-full" disabled={pending}>
              <Upload className="h-4 w-4" /> {pending ? "Uploading…" : "Upload"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Uploaded documents</CardTitle></CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="text-start text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-2 text-start font-medium">Type</th>
                    <th className="py-2 text-start font-medium">Expiry</th>
                    <th className="py-2 text-start font-medium">Status</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((d) => (
                    <tr key={d.id} className="border-b border-border last:border-0">
                      <td className="py-2">
                        <div className="font-medium">{d.typeName}</div>
                        <div className="text-xs text-muted-foreground">{d.fileName}{d.documentNumber ? ` · ${d.documentNumber}` : ""}</div>
                      </td>
                      <td className="py-2">{formatDate(d.expiryDate)}</td>
                      <td className="py-2"><DocStatusBadge status={d.status} /></td>
                      <td className="py-2">
                        <div className="flex justify-end gap-1">
                          <a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer" className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Download className="h-4 w-4" /></a>
                          <DeleteBtn id={d.id} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DeleteBtn({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-[hsl(var(--danger))]"
      disabled={pending}
      onClick={() => { if (confirm("Delete this document?")) start(async () => { await deleteDocumentAction(id); router.refresh(); }); }}
      aria-label="Delete"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
