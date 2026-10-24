import { getStudy, listSessionsForClient } from "@majlis/db";
import { isLocale, t, type Locale, type MessageKey } from "@majlis/i18n";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { Badge, Button, Card, Field, cx, inputClass } from "@/components/ui";
import { AGE_BANDS, CITIES, DIALECT_CODES, GENDERS } from "@/lib/options";
import { db, publicBaseUrl, requireUser } from "@/lib/server";
import { saveSettingsAction, setStatusAction } from "../../actions";
import { GuideEditor } from "./guide-editor";

export const dynamic = "force-dynamic";

const TABS = ["guide", "segment", "invite", "sessions"] as const;
type Tab = (typeof TABS)[number];

export default async function StudyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ tab?: string; saved?: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const user = await requireUser(locale);
  const found = await getStudy(db(), user.orgId, id).catch(() => null);
  if (!found || !found.guide) notFound();
  const { study, guide } = found;
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "guide";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{study.title}</h1>
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge tone={study.status === "recruiting" ? "good" : "neutral"}>
            {t(locale, `studies.status.${study.status}`)}
          </Badge>
          {study.templateId && (
            <Badge>{t(locale, `templates.${study.templateId}` as MessageKey)}</Badge>
          )}
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-line" aria-label="tabs">
        {TABS.map((name) => (
          <Link
            key={name}
            href={`?tab=${name}`}
            aria-current={tab === name ? "page" : undefined}
            className={cx(
              "whitespace-nowrap border-b-2 px-4 py-2",
              tab === name ? "border-palm font-semibold text-palm" : "border-transparent",
            )}
          >
            {t(locale, `study.tabs.${name}`)}
          </Link>
        ))}
      </nav>

      <Card>
        {tab === "guide" && (
          <GuideEditor
            locale={locale}
            studyId={study.id}
            initial={guide.content}
            screener={guide.screener}
            version={guide.version}
          />
        )}
        {tab === "segment" && <SegmentTab locale={locale} study={study} saved={sp.saved === "1"} />}
        {tab === "invite" && <InviteTab locale={locale} study={study} />}
        {tab === "sessions" && (
          <SessionsTab locale={locale} orgId={user.orgId} studyId={study.id} />
        )}
      </Card>
    </div>
  );
}

type Study = NonNullable<Awaited<ReturnType<typeof getStudy>>>["study"];

function Checks({
  name,
  label,
  values,
  selected,
  labelOf,
}: {
  name: string;
  label: string;
  values: readonly string[];
  selected: string[];
  labelOf: (v: string) => string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <label
            key={v}
            className="flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5"
          >
            <input type="checkbox" name={name} value={v} defaultChecked={selected.includes(v)} />
            {labelOf(v)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SegmentTab({ locale, study, saved }: { locale: Locale; study: Study; saved: boolean }) {
  const seg = study.segment;
  return (
    <form action={saveSettingsAction.bind(null, locale, study.id)} className="flex flex-col gap-6">
      <p className="text-sm opacity-70">{t(locale, "segment.hint")}</p>
      <Checks
        name="cities"
        label={t(locale, "segment.cities")}
        values={CITIES}
        selected={seg.cities}
        labelOf={(v) => t(locale, `cities.${v}` as MessageKey)}
      />
      <Checks
        name="ageBands"
        label={t(locale, "segment.ageBands")}
        values={AGE_BANDS}
        selected={seg.ageBands}
        labelOf={(v) => v}
      />
      <Checks
        name="genders"
        label={t(locale, "segment.genders")}
        values={GENDERS}
        selected={seg.genders}
        labelOf={(v) => t(locale, `gender.${v}` as MessageKey)}
      />
      <Checks
        name="dialects"
        label={t(locale, "segment.dialects")}
        values={DIALECT_CODES}
        selected={seg.dialects}
        labelOf={(v) => t(locale, `dialects.${v}` as MessageKey)}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold">{t(locale, "segment.voice")}</legend>
        {(
          [
            ["participant_choice", "segment.voiceChoice"],
            ["female", "segment.voiceFemale"],
            ["male", "segment.voiceMale"],
          ] as const
        ).map(([value, key]) => (
          <label key={value} className="flex items-center gap-2">
            <input
              type="radio"
              name="voiceSetting"
              value={value}
              defaultChecked={study.voiceSetting === value}
            />
            {t(locale, key)}
          </label>
        ))}
      </fieldset>
      <Field label={t(locale, "segment.incentive")}>
        <input
          name="incentive"
          defaultValue={study.incentive ?? ""}
          maxLength={200}
          className={inputClass}
        />
      </Field>
      <Field label={t(locale, "segment.duration")}>
        <input
          name="durationPhrase"
          defaultValue={study.durationPhrase}
          required
          maxLength={40}
          className={inputClass}
        />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit">{t(locale, "common.save")}</Button>
        {saved && <span role="status">{t(locale, "segment.saved")}</span>}
      </div>
    </form>
  );
}

async function InviteTab({ locale, study }: { locale: Locale; study: Study }) {
  const url = `${publicBaseUrl()}/${locale}/p/${study.inviteToken}`;
  const qr = await QRCode.toString(url, {
    type: "svg",
    margin: 1,
    color: { dark: "#1f2a2e", light: "#ffffff" },
  });
  const share = `https://wa.me/?text=${encodeURIComponent(t(locale, "invite.whatsappText", { topic: study.topic, url }))}`;
  const open = study.status === "recruiting";
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold">{t(locale, "invite.status")}:</span>
        <Badge tone={open ? "good" : "warn"}>{t(locale, `studies.status.${study.status}`)}</Badge>
        <form action={setStatusAction.bind(null, locale, study.id, open ? "closed" : "recruiting")}>
          <Button type="submit" variant={open ? "secondary" : "primary"}>
            {t(locale, open ? "invite.close" : "invite.open")}
          </Button>
        </form>
      </div>
      {!open && <p className="text-amber-800">{t(locale, "invite.notOpen")}</p>}
      <Field label={t(locale, "invite.link")}>
        <input readOnly value={url} dir="ltr" className={inputClass} data-testid="invite-link" />
      </Field>
      <div className="flex flex-wrap items-start gap-6">
        <figure className="flex flex-col items-center gap-2">
          <div
            className="size-44 rounded-xl border border-line bg-white p-2"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <figcaption className="text-sm">{t(locale, "invite.qr")}</figcaption>
        </figure>
        <a
          href={share}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center rounded-xl bg-[#25D366] px-4 font-semibold text-white"
        >
          {t(locale, "invite.whatsapp")}
        </a>
      </div>
    </div>
  );
}

async function SessionsTab({
  locale,
  orgId,
  studyId,
}: {
  locale: Locale;
  orgId: string;
  studyId: string;
}) {
  const sessions = await listSessionsForClient(db(), orgId, studyId);
  if (sessions.length === 0) return <p>{t(locale, "sessions.empty")}</p>;
  const fmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const label = (group: "gender" | "dialects" | "cities", v: string | null) =>
    v ? t(locale, `${group}.${v}` as MessageKey) : null;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm opacity-70">{t(locale, "sessions.privacy")}</p>
      <ul className="flex flex-col gap-3">
        {sessions.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3"
            data-session-status={s.status}
          >
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap gap-2">
                <Badge tone={s.status === "completed" ? "good" : "neutral"}>
                  {t(locale, `sessions.status.${s.status}` as MessageKey)}
                </Badge>
                {s.audioPlaybackAllowed && <Badge>{t(locale, "sessions.audioAllowed")}</Badge>}
              </div>
              <span className="text-sm opacity-80">
                {[
                  label("gender", s.participant.gender),
                  s.participant.ageBand,
                  label("cities", s.participant.city),
                  label("dialects", s.dialectDetected ?? s.participant.dialect),
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </span>
              {s.startedAt && (
                <span className="text-sm opacity-60">{fmt.format(new Date(s.startedAt))}</span>
              )}
            </div>
            <Link
              href={`/${locale}/dashboard/studies/${studyId}/sessions/${s.id}`}
              className="underline underline-offset-4"
            >
              {t(locale, "sessions.view")}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
