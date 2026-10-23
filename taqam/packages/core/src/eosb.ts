import { DateInput, round2, serviceDuration, ServiceDuration } from './dates';
import { WageComponents, totalWage, rawDaily } from './wage';

export type TerminationReason =
  | 'EMPLOYER_TERMINATION' // full award
  | 'CONTRACT_END' // full
  | 'RESIGNATION' // Art.85 fractions
  | 'ARTICLE_80' // no award
  | 'ARTICLE_81' // employee leaves for employer breach -> full
  | 'FORCE_MAJEURE' // full
  | 'FEMALE_MARRIAGE_CHILDBIRTH' // full (within 6 months of marriage / 3 of childbirth)
  | 'RETIREMENT' // full
  | 'DEATH'; // full

export interface EosbInput {
  startDate: DateInput;
  endDate: DateInput;
  /** last wage; EOSB uses totalWage */
  wage: WageComponents;
  reason: TerminationReason;
  /** encashed at dailyWage (totalWage / 30) */
  unusedLeaveDays?: number;
}

export interface EosbResult {
  service: ServiceDuration;
  /** before Art.85 factor: 0.5 month/yr first 5 yrs, 1 month/yr after, fractions pro-rata */
  fullAward: number;
  /** 0, 1/3, 2/3, 1 */
  factor: number;
  /** fullAward * factor */
  award: number;
  leaveEncashment: number;
  total: number;
  breakdown: { labelAr: string; labelEn: string; amount: number }[];
  notesAr: string[];
}

export const TERMINATION_REASON_LABELS: Record<TerminationReason, { ar: string; en: string }> = {
  EMPLOYER_TERMINATION: { ar: 'إنهاء من صاحب العمل', en: 'Employer termination' },
  CONTRACT_END: { ar: 'انتهاء مدة العقد', en: 'Contract end' },
  RESIGNATION: { ar: 'استقالة', en: 'Resignation' },
  ARTICLE_80: { ar: 'فصل وفق المادة 80', en: 'Dismissal under Article 80' },
  ARTICLE_81: { ar: 'ترك العمل وفق المادة 81', en: 'Leaving under Article 81' },
  FORCE_MAJEURE: { ar: 'قوة قاهرة', en: 'Force majeure' },
  FEMALE_MARRIAGE_CHILDBIRTH: { ar: 'إنهاء العاملة للعقد بسبب الزواج أو الإنجاب', en: 'Female worker: marriage / childbirth' },
  RETIREMENT: { ar: 'التقاعد', en: 'Retirement' },
  DEATH: { ar: 'الوفاة', en: 'Death' },
};

/** Art. 85 resignation factor: <2y 0; 2–<5 1/3; 5–<10 2/3; >=10 1. */
export function resignationFactor(totalYears: number): number {
  if (totalYears < 2) return 0;
  if (totalYears < 5) return 1 / 3;
  if (totalYears < 10) return 2 / 3;
  return 1;
}

export function eosbFactor(reason: TerminationReason, totalYears: number): number {
  if (reason === 'ARTICLE_80') return 0;
  if (reason === 'RESIGNATION') return resignationFactor(totalYears);
  return 1;
}

/**
 * End-of-service benefit (Arts. 84, 85, 80) + unused leave encashment.
 * Service end date is exclusive (see serviceDuration).
 */
export function calculateEndOfService(input: EosbInput): EosbResult {
  const service = serviceDuration(input.startDate, input.endDate);
  const monthly = totalWage(input.wage);
  const yrs = service.totalYears;
  const firstYears = Math.min(yrs, 5);
  const laterYears = Math.max(0, yrs - 5);
  const firstAmount = round2(monthly * 0.5 * firstYears);
  const laterAmount = round2(monthly * laterYears);
  const fullAward = round2(firstAmount + laterAmount);
  const factor = eosbFactor(input.reason, yrs);
  const award = round2(fullAward * factor);
  const unused = Math.max(0, input.unusedLeaveDays ?? 0);
  const leaveEncashment = round2(unused * rawDaily(input.wage));
  const total = round2(award + leaveEncashment);

  const breakdown: EosbResult['breakdown'] = [];
  breakdown.push({
    labelAr: 'الخمس سنوات الأولى: نصف راتب عن كل سنة',
    labelEn: 'First 5 years: half a month per year',
    amount: firstAmount,
  });
  if (laterYears > 0) {
    breakdown.push({
      labelAr: 'ما زاد على خمس سنوات: راتب شهر كامل عن كل سنة',
      labelEn: 'Beyond 5 years: one month per year',
      amount: laterAmount,
    });
  }
  if (factor < 1) {
    breakdown.push({
      labelAr: input.reason === 'ARTICLE_80' ? 'حرمان من المكافأة (المادة 80)' : 'تخفيض الاستقالة (المادة 85)',
      labelEn: input.reason === 'ARTICLE_80' ? 'Forfeiture (Article 80)' : 'Resignation reduction (Article 85)',
      amount: round2(award - fullAward),
    });
  }
  if (unused > 0) {
    breakdown.push({
      labelAr: `بدل رصيد الإجازات غير المستخدمة (${unused} يوم)`,
      labelEn: `Unused leave encashment (${unused} days)`,
      amount: leaveEncashment,
    });
  }

  const notesAr: string[] = [];
  notesAr.push(
    `مدة الخدمة: ${service.years} سنة و${service.months} شهر و${service.days} يوم (${round2(yrs)} سنة).`,
  );
  notesAr.push('تحسب المكافأة على أساس آخر أجر شامل (الأساسي والبدلات الثابتة) وفق المادة 84.');
  notesAr.push('تحسب أجزاء السنة بنسبة ما قضاه العامل منها في العمل.');
  switch (input.reason) {
    case 'RESIGNATION':
      if (factor === 0) notesAr.push('استقالة بخدمة أقل من سنتين: لا يستحق العامل مكافأة (المادة 85).');
      else if (factor < 0.5) notesAr.push('استقالة بخدمة من سنتين إلى أقل من خمس سنوات: يستحق ثلث المكافأة (المادة 85).');
      else if (factor < 1) notesAr.push('استقالة بخدمة من خمس إلى أقل من عشر سنوات: يستحق ثلثي المكافأة (المادة 85).');
      else notesAr.push('استقالة بخدمة عشر سنوات فأكثر: يستحق المكافأة كاملة (المادة 85).');
      break;
    case 'ARTICLE_80':
      notesAr.push('الفصل وفق المادة 80 لا يستحق معه العامل مكافأة نهاية الخدمة.');
      break;
    case 'ARTICLE_81':
      notesAr.push('ترك العامل العمل وفق المادة 81: يستحق المكافأة كاملة.');
      break;
    case 'FEMALE_MARRIAGE_CHILDBIRTH':
      notesAr.push('تستحق العاملة المكافأة كاملة إذا أنهت العقد خلال ستة أشهر من الزواج أو ثلاثة أشهر من الوضع (المادة 87).');
      break;
    case 'FORCE_MAJEURE':
      notesAr.push('ترك العمل لقوة قاهرة خارجة عن إرادة العامل: يستحق المكافأة كاملة (المادة 87).');
      break;
    default:
      notesAr.push(`سبب انتهاء العلاقة: ${TERMINATION_REASON_LABELS[input.reason]?.ar ?? input.reason} — مكافأة كاملة.`);
  }
  if (unused > 0) notesAr.push('يصرف بدل الإجازات غير المستخدمة بالأجر اليومي (الأجر الشامل ÷ 30).');

  return { service, fullAward, factor, award, leaveEncashment, total, breakdown, notesAr };
}
