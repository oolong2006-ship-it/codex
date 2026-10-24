import { isLocale, t } from "@majlis/i18n";
import { TEMPLATE_IDS } from "@majlis/interviewer";
import { notFound } from "next/navigation";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { requireUser } from "@/lib/server";
import { createStudyAction } from "../../actions";

export default async function NewStudyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await requireUser(locale);
  const { error } = await searchParams;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t(locale, "newStudy.title")}</h1>
      <Card>
        <form action={createStudyAction.bind(null, locale)} className="flex flex-col gap-5">
          <Field label={t(locale, "newStudy.objective")} hint={t(locale, "newStudy.objectiveHint")}>
            <textarea
              name="objective"
              required
              minLength={5}
              maxLength={300}
              rows={3}
              className={inputClass}
            />
          </Field>
          {error && (
            <p role="alert" className="text-red-700">
              {t(locale, "newStudy.required")}
            </p>
          )}
          <Field label={`${t(locale, "newStudy.template")} (${t(locale, "common.optional")})`}>
            <select name="templateId" className={inputClass} defaultValue="">
              <option value="">{t(locale, "newStudy.templateAuto")}</option>
              {TEMPLATE_IDS.map((id) => (
                <option key={id} value={id}>
                  {t(locale, `templates.${id}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={`${t(locale, "newStudy.topic")} (${t(locale, "common.optional")})`}
            hint={t(locale, "newStudy.topicHint")}
          >
            <input name="topic" maxLength={80} className={inputClass} />
          </Field>
          <Button type="submit">{t(locale, "newStudy.submit")}</Button>
        </form>
      </Card>
    </div>
  );
}
