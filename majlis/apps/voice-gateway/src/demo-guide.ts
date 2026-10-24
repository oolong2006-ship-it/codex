import type { InterviewGuide } from "@majlis/interviewer";

/** Sample guide for the local /dev page only. */
export const demoGuide: InterviewGuide = {
  studyId: "demo",
  topic: "المطعم",
  durationPhrase: "خمس دقايق",
  sections: [
    {
      id: "visit",
      title: "الزيارة",
      questions: [
        { id: "q1", text: "وش اللي خلاك تختار هالمطعم آخر مرة؟" },
        { id: "q2", text: "كيف كانت تجربة الطلب والاستلام؟" },
      ],
    },
    {
      id: "improve",
      title: "التحسين",
      questions: [{ id: "q3", text: "لو بيدك تغيّر شي واحد في المطعم، وش بيكون؟" }],
    },
  ],
};
