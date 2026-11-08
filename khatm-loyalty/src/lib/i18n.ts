/**
 * Arabic-first dictionary. Every user-facing string lives here as an { ar, en } pair.
 * Keys are grouped by surface. Use t(lang, key, params) — `{name}` placeholders are interpolated.
 */
export type Lang = "ar" | "en";
export const DEFAULT_LANG: Lang = "ar";
export const LANG_COOKIE = "khatm_lang";

const dict = {
  // ── Brand / common
  "brand.name": { ar: "ختم", en: "Khatm" },
  "brand.tagline": { ar: "بطاقات ولاء رقمية في محفظة جوال عميلك — بدون تطبيق", en: "Digital loyalty cards in your customer's phone wallet — no app needed" },
  "common.save": { ar: "حفظ", en: "Save" },
  "common.saved": { ar: "تم الحفظ", en: "Saved" },
  "common.cancel": { ar: "إلغاء", en: "Cancel" },
  "common.add": { ar: "إضافة", en: "Add" },
  "common.delete": { ar: "حذف", en: "Delete" },
  "common.edit": { ar: "تعديل", en: "Edit" },
  "common.active": { ar: "نشط", en: "Active" },
  "common.inactive": { ar: "موقوف", en: "Inactive" },
  "common.logout": { ar: "تسجيل الخروج", en: "Sign out" },
  "common.language": { ar: "English", en: "العربية" },
  "common.name": { ar: "الاسم", en: "Name" },
  "common.phone": { ar: "رقم الجوال", en: "Mobile number" },
  "common.email": { ar: "البريد الإلكتروني", en: "Email" },
  "common.password": { ar: "كلمة المرور", en: "Password" },
  "common.city": { ar: "المدينة", en: "City" },
  "common.branch": { ar: "الفرع", en: "Branch" },
  "common.role": { ar: "الصلاحية", en: "Role" },
  "common.status": { ar: "الحالة", en: "Status" },
  "common.date": { ar: "التاريخ", en: "Date" },
  "common.none": { ar: "لا يوجد", en: "None" },
  "common.back": { ar: "رجوع", en: "Back" },
  "common.print": { ar: "طباعة", en: "Print" },
  "common.download": { ar: "تنزيل", en: "Download" },
  "common.continue": { ar: "متابعة", en: "Continue" },
  "common.daysAgo": { ar: "قبل {n} يوم", en: "{n} days ago" },
  "common.today": { ar: "اليوم", en: "Today" },
  "common.never": { ar: "لم يزر بعد", en: "Never" },

  // ── Roles
  "role.OWNER": { ar: "مالك", en: "Owner" },
  "role.MANAGER": { ar: "مدير", en: "Manager" },
  "role.CASHIER": { ar: "كاشير", en: "Cashier" },

  // ── Errors
  "errors.generic": { ar: "حدث خطأ غير متوقع، حاول مرة أخرى", en: "Something went wrong, please try again" },
  "errors.notFound": { ar: "العنصر غير موجود", en: "Not found" },
  "errors.forbidden": { ar: "ليست لديك صلاحية لهذا الإجراء", en: "You don't have permission for this action" },
  "errors.unauthenticated": { ar: "يرجى تسجيل الدخول", en: "Please sign in" },
  "errors.rateLimited": { ar: "محاولات كثيرة، انتظر قليلاً ثم حاول مجدداً", en: "Too many attempts, please wait and retry" },
  "errors.invalidInput": { ar: "تحقق من البيانات المدخلة", en: "Please check the entered data" },
  "errors.invalidCredentials": { ar: "البريد أو كلمة المرور غير صحيحة", en: "Incorrect email or password" },
  "errors.invalidPin": { ar: "رمز الدخول غير صحيح", en: "Incorrect PIN" },
  "errors.emailTaken": { ar: "البريد الإلكتروني مسجل مسبقاً", en: "This email is already registered" },
  "errors.slugTaken": { ar: "هذا الرابط مستخدم، اختر رابطاً آخر", en: "This link is taken, choose another" },
  "errors.invalidPhone": { ar: "رقم الجوال غير صحيح (مثال: 05XXXXXXXX)", en: "Invalid mobile number (e.g. 05XXXXXXXX)" },
  "errors.consentRequired": { ar: "يجب الموافقة على سياسة الخصوصية", en: "You must accept the privacy policy" },
  "errors.invalidCard": { ar: "البطاقة غير صالحة أو لا تتبع هذا المتجر", en: "Invalid card, or it doesn't belong to this business" },
  "errors.cardVoid": { ar: "هذه البطاقة ملغاة", en: "This card has been cancelled" },
  "errors.cooldown": { ar: "تمت إضافة ختم لهذه البطاقة قبل قليل. يمكن الختم مجدداً بعد {minutes} دقيقة", en: "This card was stamped recently. You can stamp again in {minutes} min" },
  "errors.tooManyStamps": { ar: "الحد الأقصى {max} أختام في المرة الواحدة", en: "Maximum {max} stamps per scan" },
  "errors.noReward": { ar: "لا توجد مكافأة جاهزة على هذه البطاقة", en: "No reward is ready on this card" },
  "errors.programInactive": { ar: "برنامج الولاء متوقف حالياً", en: "This loyalty program is currently paused" },
  "errors.lastOwner": { ar: "لا يمكن إيقاف آخر مالك للحساب", en: "You can't deactivate the last owner" },
  "errors.pinTaken": { ar: "رمز الدخول مستخدم لموظف آخر", en: "This PIN is used by another staff member" },
  "errors.branchRequired": { ar: "اختر الفرع", en: "Choose a branch" },
  "errors.weakPassword": { ar: "كلمة المرور يجب ألا تقل عن 10 أحرف", en: "Password must be at least 10 characters" },

  // ── Landing
  "landing.hero": { ar: "خلّ عميلك يرجع لك — بختم واحد", en: "Bring customers back — one stamp at a time" },
  "landing.sub": { ar: "بطاقة ولاء في Apple Wallet و Google Wallet، تُحدَّث لحظياً مع كل زيارة. بدون تطبيق، وبدون بطاقات ورقية.", en: "A loyalty card in Apple Wallet & Google Wallet that updates live with every visit. No app, no paper." },
  "landing.cta": { ar: "ابدأ مجاناً", en: "Start free" },
  "landing.login": { ar: "دخول التاجر", en: "Merchant sign in" },
  "landing.staff": { ar: "دخول الكاشير", en: "Cashier sign in" },
  "landing.f1.title": { ar: "بدون تطبيق", en: "No app to download" },
  "landing.f1.body": { ar: "العميل يمسح الرمز ويضيف البطاقة لمحفظته خلال 20 ثانية.", en: "Customers scan and add the card to their wallet in 20 seconds." },
  "landing.f2.title": { ar: "تحديث لحظي", en: "Live updates" },
  "landing.f2.body": { ar: "كل ختم يظهر فوراً في بطاقة العميل مع إشعار عند جاهزية المكافأة.", en: "Every stamp shows instantly, with a notification when a reward is ready." },
  "landing.f3.title": { ar: "حماية من التلاعب", en: "Fraud protection" },
  "landing.f3.body": { ar: "رموز موقّعة، فترة انتظار بين الأختام، وسجل كامل لكل عملية.", en: "Signed codes, cooldowns between stamps and a full audit trail." },
  "landing.f4.title": { ar: "استرجاع العملاء", en: "Win customers back" },
  "landing.f4.body": { ar: "نعرف لك العملاء المنقطعين ونرسل لهم عرضاً عبر واتساب.", en: "We spot customers drifting away and send them an offer on WhatsApp." },

  // ── Auth
  "auth.login.title": { ar: "تسجيل دخول التاجر", en: "Merchant sign in" },
  "auth.login.submit": { ar: "دخول", en: "Sign in" },
  "auth.login.noAccount": { ar: "ليس لديك حساب؟", en: "No account yet?" },
  "auth.signup.title": { ar: "أنشئ حساب متجرك", en: "Create your business account" },
  "auth.signup.businessName": { ar: "اسم المقهى / المتجر", en: "Café / business name" },
  "auth.signup.slug": { ar: "رابط المتجر (بالإنجليزية)", en: "Business link (latin letters)" },
  "auth.signup.slugHint": { ar: "أحرف إنجليزية صغيرة وأرقام وشرطة فقط، مثال: brew-house", en: "Lowercase letters, digits and dashes, e.g. brew-house" },
  "auth.signup.ownerName": { ar: "اسمك", en: "Your name" },
  "auth.signup.firstBranch": { ar: "اسم الفرع الأول", en: "First branch name" },
  "auth.signup.submit": { ar: "إنشاء الحساب", en: "Create account" },
  "auth.signup.haveAccount": { ar: "لديك حساب؟", en: "Already have an account?" },

  // ── Dashboard nav
  "nav.overview": { ar: "نظرة عامة", en: "Overview" },
  "nav.customers": { ar: "العملاء", en: "Customers" },
  "nav.program": { ar: "برنامج الولاء", en: "Loyalty program" },
  "nav.poster": { ar: "ملصق المتجر", en: "In-store poster" },
  "nav.branches": { ar: "الفروع", en: "Branches" },
  "nav.staff": { ar: "الموظفون", en: "Staff" },
  "nav.campaigns": { ar: "الحملات", en: "Campaigns" },
  "nav.integrations": { ar: "التكاملات", en: "Integrations" },
  "nav.activity": { ar: "سجل العمليات", en: "Activity log" },
  "nav.openStaff": { ar: "فتح شاشة الكاشير", en: "Open cashier screen" },

  // ── Overview / analytics
  "kpi.customers": { ar: "إجمالي العملاء", en: "Total customers" },
  "kpi.active30": { ar: "عملاء نشطون (30 يوم)", en: "Active customers (30d)" },
  "kpi.visits30": { ar: "زيارات (30 يوم)", en: "Visits (30d)" },
  "kpi.repeatRate": { ar: "نسبة العودة", en: "Repeat rate" },
  "kpi.repeatRateHint": { ar: "من زار مرتين أو أكثر خلال 90 يوماً", en: "Visited 2+ times in the last 90 days" },
  "kpi.redemptions30": { ar: "مكافآت مستبدلة (30 يوم)", en: "Rewards redeemed (30d)" },
  "kpi.rewardsReady": { ar: "مكافآت جاهزة لم تُستبدل", en: "Rewards ready, not redeemed" },
  "analytics.weeklyVisits": { ar: "الزيارات الأسبوعية (آخر 12 أسبوعاً)", en: "Weekly visits (last 12 weeks)" },
  "analytics.byBranch": { ar: "أداء الفروع (30 يوم)", en: "Branch performance (30d)" },
  "analytics.atRisk": { ar: "عملاء مهددون بالانقطاع", en: "Customers at risk of churning" },
  "analytics.atRiskHint": { ar: "عملاء متكررون تأخروا عن معدل زياراتهم المعتاد", en: "Repeat customers overdue versus their usual visit rhythm" },
  "analytics.lastVisit": { ar: "آخر زيارة", en: "Last visit" },
  "analytics.usualEvery": { ar: "يزور عادة كل {n} يوم", en: "Usually every {n} days" },
  "analytics.visits": { ar: "الزيارات", en: "Visits" },
  "analytics.stamps": { ar: "الأختام", en: "Stamps" },
  "analytics.redemptions": { ar: "الاستبدالات", en: "Redemptions" },
  "analytics.empty": { ar: "لا توجد بيانات بعد — ابدأ بطباعة ملصق المتجر", en: "No data yet — start by printing your in-store poster" },
  "analytics.sendWinback": { ar: "أرسل لهم عرض استرجاع", en: "Send them a win-back offer" },

  // ── Customers
  "customers.title": { ar: "العملاء", en: "Customers" },
  "customers.search": { ar: "ابحث بالاسم أو الجوال", en: "Search by name or mobile" },
  "customers.exportCsv": { ar: "تصدير CSV", en: "Export CSV" },
  "customers.stamps": { ar: "الأختام الحالية", en: "Current stamps" },
  "customers.rewards": { ar: "مكافآت جاهزة", en: "Rewards ready" },
  "customers.totalVisits": { ar: "إجمالي الأختام", en: "Total stamps" },
  "customers.joined": { ar: "تاريخ الانضمام", en: "Joined" },
  "customers.marketing": { ar: "يقبل العروض", en: "Accepts offers" },
  "customers.exportData": { ar: "تصدير بياناته", en: "Export data" },
  "customers.deleteData": { ar: "حذف بياناته نهائياً", en: "Delete permanently" },
  "customers.deleteConfirm": { ar: "سيتم حذف بيانات العميل وإلغاء بطاقته نهائياً. هل أنت متأكد؟", en: "The customer's data will be deleted and their card voided. Are you sure?" },
  "customers.deleted": { ar: "تم حذف بيانات العميل", en: "Customer data deleted" },
  "customers.empty": { ar: "لا يوجد عملاء بعد", en: "No customers yet" },

  // ── Program
  "program.title": { ar: "برنامج الولاء", en: "Loyalty program" },
  "program.name": { ar: "اسم البطاقة", en: "Card name" },
  "program.stampsRequired": { ar: "عدد الأختام للمكافأة", en: "Stamps needed for a reward" },
  "program.reward": { ar: "المكافأة", en: "Reward" },
  "program.rewardPlaceholder": { ar: "مثال: مشروب مجاني بأي حجم", en: "e.g. A free drink, any size" },
  "program.cooldown": { ar: "أقل مدة بين ختمين (بالدقائق)", en: "Minimum minutes between stamps" },
  "program.maxPerScan": { ar: "أقصى عدد أختام في المسح الواحد", en: "Max stamps per scan" },
  "program.welcome": { ar: "أختام ترحيبية عند التسجيل", en: "Welcome stamps on sign-up" },
  "program.terms": { ar: "الشروط والأحكام (تظهر خلف البطاقة)", en: "Terms (shown on the back of the card)" },
  "program.design": { ar: "تصميم البطاقة", en: "Card design" },
  "program.bgColor": { ar: "لون الخلفية", en: "Background color" },
  "program.fgColor": { ar: "لون النص", en: "Text color" },
  "program.accentColor": { ar: "لون الأختام", en: "Stamp color" },
  "program.stampIcon": { ar: "رمز الختم", en: "Stamp icon" },
  "program.active": { ar: "البرنامج مفعّل", en: "Program is active" },
  "program.preview": { ar: "معاينة البطاقة", en: "Card preview" },
  "program.joinLink": { ar: "رابط انضمام العملاء", en: "Customer join link" },

  // ── Card (wallet + web)
  "card.stamps": { ar: "الأختام", en: "Stamps" },
  "card.progress": { ar: "{current} من {required}", en: "{current} of {required}" },
  "card.reward": { ar: "المكافأة", en: "Reward" },
  "card.rewardsReady": { ar: "مكافآت جاهزة", en: "Rewards ready" },
  "card.rewardReadyBanner": { ar: "🎉 مكافأتك جاهزة! اعرض البطاقة على الكاشير", en: "🎉 Your reward is ready! Show this card at the counter" },
  "card.remaining": { ar: "باقي {n} للمكافأة", en: "{n} more to your reward" },
  "card.member": { ar: "العضو", en: "Member" },
  "card.showToCashier": { ar: "اعرض هذا الرمز على الكاشير", en: "Show this code to the cashier" },
  "card.addApple": { ar: "إضافة إلى Apple Wallet", en: "Add to Apple Wallet" },
  "card.addGoogle": { ar: "إضافة إلى Google Wallet", en: "Add to Google Wallet" },
  "card.webCard": { ar: "بطاقتك على الويب", en: "Your web card" },
  "card.mockNotice": { ar: "وضع التجربة: ربط Apple/Google Wallet غير مفعّل بعد، البطاقة تعمل من هذه الصفحة.", en: "Demo mode: Apple/Google Wallet isn't configured yet; the card works from this page." },
  "card.bookmark": { ar: "احفظ هذه الصفحة في الشاشة الرئيسية للوصول السريع", en: "Add this page to your home screen for quick access" },
  "card.deleteMyData": { ar: "حذف بياناتي", en: "Delete my data" },
  "card.deleteMyDataConfirm": { ar: "سيتم حذف بياناتك وإلغاء البطاقة وأختامها نهائياً. متأكد؟", en: "Your data, card and stamps will be permanently deleted. Are you sure?" },
  "card.deletedTitle": { ar: "تم حذف بياناتك", en: "Your data has been deleted" },
  "card.terms": { ar: "الشروط", en: "Terms" },
  "card.poweredBy": { ar: "بواسطة ختم", en: "Powered by Khatm" },

  // ── Join
  "join.title": { ar: "انضم لبطاقة ولاء {merchant}", en: "Join {merchant}'s loyalty card" },
  "join.offer": { ar: "اجمع {n} أختام واحصل على: {reward}", en: "Collect {n} stamps and get: {reward}" },
  "join.welcomeBonus": { ar: "🎁 تحصل على {n} ختم ترحيبي فور التسجيل", en: "🎁 Get {n} welcome stamp(s) when you join" },
  "join.consent": { ar: "أوافق على سياسة الخصوصية وحفظ اسمي ورقم جوالي لغرض برنامج الولاء", en: "I accept the privacy policy and the storage of my name and mobile for this loyalty program" },
  "join.marketing": { ar: "أرغب باستلام العروض عبر واتساب (اختياري)", en: "Send me offers on WhatsApp (optional)" },
  "join.submit": { ar: "احصل على بطاقتي", en: "Get my card" },
  "join.privacy": { ar: "سياسة الخصوصية", en: "Privacy policy" },
  "join.unavailable": { ar: "هذا البرنامج غير متاح حالياً", en: "This program is not available right now" },
  "join.existing": { ar: "لديك بطاقة مسبقاً — أعدنا لك نفس البطاقة", en: "You already have a card — here it is" },

  // ── Poster
  "poster.title": { ar: "ملصق المتجر", en: "In-store poster" },
  "poster.help": { ar: "اطبع الملصق وضعه عند الكاشير أو على الطاولات. العميل يمسح الرمز بكاميرا جواله.", en: "Print it and place it at the counter or on tables. Customers scan it with their phone camera." },
  "poster.headline": { ar: "امسح واحصل على بطاقة الولاء", en: "Scan to get your loyalty card" },
  "poster.sub": { ar: "{n} أختام = {reward}", en: "{n} stamps = {reward}" },
  "poster.noApp": { ar: "بدون تطبيق • تُحفظ في محفظة جوالك", en: "No app • Saved in your phone wallet" },
  "poster.downloadPng": { ar: "تنزيل الرمز PNG", en: "Download QR (PNG)" },

  // ── Branches & staff
  "branches.title": { ar: "الفروع", en: "Branches" },
  "branches.add": { ar: "إضافة فرع", en: "Add branch" },
  "staff.title": { ar: "الموظفون", en: "Staff" },
  "staff.add": { ar: "إضافة موظف", en: "Add staff member" },
  "staff.pin": { ar: "رمز دخول الكاشير (4-6 أرقام)", en: "Cashier PIN (4-6 digits)" },
  "staff.pinHint": { ar: "يستخدمه الكاشير للدخول من جهاز الفرع", en: "Used by the cashier to sign in on the branch device" },
  "staff.passwordHint": { ar: "للمالك والمدير: دخول لوحة التحكم بالبريد وكلمة المرور", en: "Owners/managers sign in to the dashboard with email + password" },
  "staff.deactivate": { ar: "إيقاف", en: "Deactivate" },
  "staff.activate": { ar: "تفعيل", en: "Activate" },
  "staff.cashierLoginInfo": { ar: "رابط دخول الكاشير: {url} — رمز المتجر: {slug}", en: "Cashier sign-in: {url} — business code: {slug}" },

  // ── Staff PWA
  "pos.login.title": { ar: "دخول الكاشير", en: "Cashier sign in" },
  "pos.login.merchant": { ar: "رمز المتجر", en: "Business code" },
  "pos.login.pin": { ar: "رمز الدخول", en: "PIN" },
  "pos.login.submit": { ar: "دخول", en: "Sign in" },
  "pos.chooseBranch": { ar: "اختر الفرع لهذا الجهاز", en: "Choose this device's branch" },
  "pos.scan": { ar: "امسح بطاقة العميل", en: "Scan customer card" },
  "pos.startCamera": { ar: "تشغيل الكاميرا", en: "Start camera" },
  "pos.stopCamera": { ar: "إيقاف الكاميرا", en: "Stop camera" },
  "pos.manual": { ar: "أو ابحث برقم الجوال", en: "Or look up by mobile" },
  "pos.lookup": { ar: "بحث", en: "Look up" },
  "pos.cameraError": { ar: "تعذّر تشغيل الكاميرا. اسمح بالوصول أو استخدم البحث بالجوال.", en: "Couldn't start the camera. Allow access or use mobile lookup." },
  "pos.addStamp": { ar: "إضافة ختم", en: "Add stamp" },
  "pos.addStamps": { ar: "إضافة {n} أختام", en: "Add {n} stamps" },
  "pos.redeem": { ar: "استبدال المكافأة", en: "Redeem reward" },
  "pos.stamped": { ar: "✓ تمت إضافة {n} ختم", en: "✓ Added {n} stamp(s)" },
  "pos.rewardEarned": { ar: "🎉 اكتملت البطاقة! المكافأة أصبحت جاهزة", en: "🎉 Card complete! A reward is now ready" },
  "pos.redeemed": { ar: "✓ تم استبدال المكافأة: {reward}", en: "✓ Reward redeemed: {reward}" },
  "pos.next": { ar: "عميل جديد", en: "Next customer" },
  "pos.quantity": { ar: "عدد الأختام", en: "Stamps" },
  "pos.lastVisit": { ar: "آخر زيارة: {when}", en: "Last visit: {when}" },
  "pos.firstVisit": { ar: "أول زيارة 👋", en: "First visit 👋" },
  "pos.notFoundPhone": { ar: "لا توجد بطاقة بهذا الرقم", en: "No card with this number" },
  "pos.offline": { ar: "لا يوجد اتصال بالإنترنت", en: "You're offline" },

  // ── Campaigns
  "campaigns.title": { ar: "الحملات", en: "Campaigns" },
  "campaigns.new": { ar: "حملة جديدة", en: "New campaign" },
  "campaigns.template": { ar: "القالب", en: "Template" },
  "campaigns.audience": { ar: "الجمهور", en: "Audience" },
  "campaigns.audience.ALL": { ar: "كل العملاء الموافقين على العروض", en: "All opted-in customers" },
  "campaigns.audience.AT_RISK": { ar: "العملاء المهددون بالانقطاع", en: "Customers at risk" },
  "campaigns.audience.REWARD_READY": { ar: "من لديهم مكافأة لم تُستبدل", en: "Customers with an unredeemed reward" },
  "campaigns.message": { ar: "نص الرسالة", en: "Message" },
  "campaigns.messageHint": { ar: "يمكنك استخدام {name} لاسم العميل و {business} لاسم المتجر", en: "Use {name} for the customer name and {business} for your business" },
  "campaigns.send": { ar: "إرسال الحملة", en: "Send campaign" },
  "campaigns.sent": { ar: "تم الإرسال إلى {n} عميل", en: "Sent to {n} customers" },
  "campaigns.preview": { ar: "معاينة الرسالة", en: "Message preview" },
  "campaigns.recipients": { ar: "المستلمون", en: "Recipients" },
  "campaigns.history": { ar: "الحملات السابقة", en: "Past campaigns" },
  "campaigns.consentNote": { ar: "تُرسل الرسائل فقط للعملاء الذين وافقوا على استلام العروض.", en: "Messages only go to customers who opted in to offers." },
  "campaigns.providerConsole": { ar: "مزود الرسائل في وضع التجربة — لن تُرسل رسائل حقيقية.", en: "Messaging is in demo mode — no real messages are sent." },

  // ── Integrations
  "integrations.title": { ar: "التكاملات", en: "Integrations" },
  "integrations.foodics": { ar: "Foodics — ختم تلقائي عند الدفع", en: "Foodics — automatic stamp at checkout" },
  "integrations.foodicsBody": { ar: "عند إغلاق طلب في نقطة البيع ومعه رقم جوال العميل، يُضاف الختم تلقائياً دون مسح.", en: "When an order closes at the POS with the customer's mobile, a stamp is added automatically — no scan." },
  "integrations.enable": { ar: "تفعيل", en: "Enable" },
  "integrations.webhookUrl": { ar: "رابط الـ Webhook", en: "Webhook URL" },
  "integrations.secret": { ar: "المفتاح السري (للتوقيع)", en: "Signing secret" },
  "integrations.enabled": { ar: "مفعّل", en: "Enabled" },

  // ── Activity
  "activity.title": { ar: "سجل العمليات", en: "Activity log" },
  "activity.action": { ar: "العملية", en: "Action" },
  "activity.by": { ar: "بواسطة", en: "By" },

  // ── Privacy
  "privacy.title": { ar: "سياسة الخصوصية", en: "Privacy policy" },
} satisfies Record<string, { ar: string; en: string }>;

export type DictKey = keyof typeof dict;

export function t(lang: Lang, key: DictKey | string, params: Record<string, string | number> = {}): string {
  const entry = (dict as Record<string, { ar: string; en: string }>)[key];
  let s = entry ? entry[lang] : key;
  for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function hasKey(key: string): key is DictKey {
  return key in dict;
}

export const dir = (lang: Lang) => (lang === "ar" ? "rtl" : "ltr");

export function fmtNumber(lang: Lang, n: number) {
  return new Intl.NumberFormat(lang === "ar" ? "ar-SA-u-nu-latn" : "en-US").format(n);
}

export function fmtDate(lang: Lang, d: Date | string) {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", {
    dateStyle: "medium",
    timeZone: "Asia/Riyadh",
  }).format(new Date(d));
}

export function fmtDateTime(lang: Lang, d: Date | string) {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  }).format(new Date(d));
}

export { dict };
