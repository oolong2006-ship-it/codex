"use client";

import { useActionState, useState } from "react";
import { sendCampaignAction } from "./actions";
import { FormMessage, SubmitButton } from "@/components/form-bits";

type Template = { key: string; name: string; message: string; suggestedAudience: string };

export function CampaignForm({
  templates, audiences, sizes, initialTemplate, initialAudience, labels, business,
}: {
  templates: Template[];
  audiences: Array<{ key: string; label: string }>;
  sizes: Record<string, number>;
  initialTemplate?: string;
  initialAudience?: string;
  labels: Record<"template" | "audience" | "message" | "messageHint" | "send" | "recipients" | "preview", string>;
  business: string;
}) {
  const [state, action] = useActionState(sendCampaignAction, undefined);
  const first = templates.find((x) => x.key === initialTemplate) ?? templates[0]!;
  const [tpl, setTpl] = useState(first.key);
  const [audience, setAudience] = useState(initialAudience ?? first.suggestedAudience);
  const [message, setMessage] = useState(first.message);
  const preview = message.replaceAll("{name}", "سارة").replaceAll("{business}", business);
  return (
    <form action={action} className="card grid gap-5 p-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="c-tpl">{labels.template}</label>
            <select id="c-tpl" name="templateKey" className="input" value={tpl} onChange={(e) => {
              const x = templates.find((t) => t.key === e.target.value)!;
              setTpl(x.key); setMessage(x.message); setAudience(x.suggestedAudience);
            }}>
              {templates.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="c-aud">{labels.audience}</label>
            <select id="c-aud" name="audience" className="input" value={audience} onChange={(e) => setAudience(e.target.value)}>
              {audiences.map((a) => <option key={a.key} value={a.key}>{a.label} ({sizes[a.key] ?? 0})</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="c-msg">{labels.message}</label>
          <textarea id="c-msg" name="message" rows={4} maxLength={600} required className="input" value={message} onChange={(e) => setMessage(e.target.value)} />
          <p className="mt-1 text-xs text-espresso-500">{labels.messageHint}</p>
        </div>
        <FormMessage state={state} />
        <SubmitButton className="btn-accent">{labels.send} · {labels.recipients}: {sizes[audience] ?? 0}</SubmitButton>
      </div>
      <div>
        <div className="mb-2 text-sm font-medium text-espresso-500">{labels.preview}</div>
        <div className="rounded-2xl bg-[#e5ddd5] p-4">
          <div className="ms-auto max-w-[85%] whitespace-pre-wrap rounded-xl rounded-se-none bg-[#dcf8c6] px-3 py-2 text-sm text-espresso-900 shadow-sm">{preview}</div>
        </div>
      </div>
    </form>
  );
}
