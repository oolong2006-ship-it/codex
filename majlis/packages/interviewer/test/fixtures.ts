import type { InterviewGuide } from "../src/index.js";

export const restaurantGuide: InterviewGuide = {
  studyId: "study-restaurant-1",
  topic: "المطعم",
  incentive: "والحافز بيوصلك على جوالك خلال يومين.",
  sections: [
    {
      id: "visit",
      title: "الزيارة",
      questions: [
        { id: "q1", text: "وش اللي خلاك تختار هالمطعم آخر مرة؟" },
        {
          id: "q2",
          text: "كيف كانت تجربة الطلب والاستلام؟",
          coverKeywords: ["الطلب", "الاستلام", "التوصيل", "تاخر"],
        },
      ],
    },
    {
      id: "price",
      title: "الأسعار",
      questions: [
        {
          id: "q3",
          text: "وش رأيك في الأسعار مقارنة بالأكل والخدمة؟",
          coverKeywords: ["الأسعار", "غالي", "غالية", "رخيص", "ريال"],
        },
        { id: "q4", text: "تقريباً وين يقع دخل الأسرة بالشهر؟", sensitive: true },
      ],
    },
    {
      id: "improve",
      title: "التحسين",
      questions: [{ id: "q5", text: "لو بيدك تغيّر شي واحد في المطعم، وش بيكون؟" }],
    },
  ],
};
