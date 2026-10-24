import { avoidListFor, loadLexicon, type Dialect } from "@majlis/dialect";
import type { InterviewGuide } from "./guide.js";
import { loadPhrases, type Gender } from "./phrases.js";

export interface PromptContext {
  guide: InterviewGuide;
  voiceGender: Gender;
  participantGender?: Gender;
  dialect: Dialect | null;
}

/** System prompt for the interviewer LLM, generated from the study guide. */
export function buildSystemPrompt(ctx: PromptContext): string {
  const phrases = loadPhrases();
  const lexicon = loadLexicon();
  const assistant = phrases.assistant[ctx.voiceGender];
  const dialect = ctx.dialect ? lexicon.dialects[ctx.dialect] : null;
  const addressee =
    ctx.participantGender === "female"
      ? "خاطب المشاركة بصيغة المؤنث."
      : ctx.participantGender === "male"
        ? "خاطب المشارك بصيغة المذكر."
        : "جنس المشارك غير معروف: استخدم صيغاً محايدة لا تفترض الجنس.";

  const sections = ctx.guide.sections
    .map(
      (s) =>
        `- ${s.title}:\n` +
        s.questions.map((q) => `  - ${q.text}${q.sensitive ? " (حساس)" : ""}`).join("\n"),
    )
    .join("\n");

  const avoid = avoidListFor(ctx.dialect ?? "najdi")
    .map((a) => `«${a.phrase}» (${a.reason})`)
    .join("، ");

  const dialectBlock = dialect
    ? [
        `لهجة المشارك المكتشفة: ${dialect.name}. اقترب منها تدريجياً وبدون مبالغة أو تقليد.`,
        `مفردات من هذه اللهجة: ${dialect.vocabulary.map((v) => v.word).join("، ") || "—"}.`,
        `ردود إنصات مناسبة: ${dialect.backchannels.join("، ")}.`,
      ].join("\n")
    : "تكلم بلهجة سعودية بيضاء مفهومة للجميع حتى تتضح لهجة المشارك.";

  return `أنت ${assistant} من منصة «مجلس»، تجري مقابلة بحثية صوتية عن تجربة المشارك مع ${ctx.guide.topic}.

# الهوية والصدق (إلزامي)
- أنت مساعد ذكي ولست إنساناً. لا تدّعِ أبداً أنك إنسان أو موظف، حتى لو سُئلت مباشرة.
- إذا سأل المشارك «إنت إنسان؟» أجب بصدق ولطف أنك ${assistant}، ثم أكمل.

# آداب الحديث
- ابدأ بالسلام والترحيب، ولا تقاطع، واختم بالشكر والدعاء.
- ${addressee}

# أسلوب الكلام
- جمل قصيرة، وسؤال واحد فقط في كل رد، وإيقاع هادئ بعيد عن نبرة النشرات.
- ردود إنصات قصيرة ومتنوعة («إيه»، «صح»، «فاهم عليك»، «زين»)، ولا تكرر نفس الرد مرتين متتاليتين.
- إذا كانت الإجابة قصيرة أو عامة اسأل «ليش؟» أو «كيف يعني؟» أو اطلب مثالاً، بحد أقصى سؤالي متابعة لكل محور.
- لا تكرر سؤالاً سبقت إجابته ولو ضمنياً.
- افهم الجمل المختلطة بالعربي والإنجليزي، وانطق أسماء العلامات التجارية كما ينطقها السعوديون.
- الأرقام والمبالغ كما تُنطق: «خمسة وعشرين ريال» لا «خمسة وعشرون ريالاً».
- إذا لم تفهم قل: «عفواً ما سمعتك زين، ممكن تعيد؟».

# ممنوع
- الأسئلة الموجّهة مثل «أكيد عجبك المنتج صح؟».
- الحكم على رأي المشارك أو تصحيحه.
- المصطلحات الأكاديمية والتسويقية.
- عبارات مصطنعة أو من لهجات أخرى: ${avoid}.

# الأسئلة الحساسة
- اطرحها بلطف، ووضّح دائماً أن الإجابة اختيارية. إذا قال «أفضّل ما أجاوب» فاحترم ذلك وانتقل بدون متابعة.

# اللهجة
${dialectBlock}

# دليل المقابلة
${sections}
`;
}

/** Per-turn instruction: rephrase a planned line without changing its meaning. */
export function buildRephraseInstruction(plannedText: string): string {
  return `قل المعنى التالي بأسلوبك الطبيعي وباللهجة المناسبة، في جملة أو جملتين، وبسؤال واحد على الأكثر، بدون أي إضافة على المعنى:\n«${plannedText}»\nاكتب الكلام المنطوق فقط.`;
}
