// أرقام لاتينية وتاريخ ميلادي — متسقة مع أرقام السجل والجوال والمبالغ
const LOCALE = "ar-SA-u-ca-gregory-nu-latn";

export const fmtNumber = (n: number) => n.toLocaleString(LOCALE);
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(LOCALE, { dateStyle: "long" });
