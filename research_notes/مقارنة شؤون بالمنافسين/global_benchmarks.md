# Global HR/Payroll Platforms Selling into Saudi Arabia: Benchmarks for "Shuoon" (Darwinbox, Zoho People + Payroll KSA, Deel, Rippling, and frontline tools Deputy / Connecteam / Homebase)

*Method note (researched 30 Oct 2026): direct page fetching was blocked for zoho.com and deel.com in this session's network allowlist. Findings for those vendors come from search-engine extraction of the cited pages, so prices and exact wording should be re-checked on the live pages. Several "best HR software in Saudi" comparison blogs cited below are written by competing GCC HR vendors (Hono, Bayzat, Zimyo, NeuralHR and others). They are flagged as biased wherever they are used.*

---

## Q1. Darwinbox in Saudi Arabia: Saudi customers, Saudi payroll/GOSI/Mudad support, KSA data centres, AI features

### Takeaway
Darwinbox is an enterprise HCM that has pushed into MENA since 2022: it has operations in Riyadh and Dubai, an Arabic mobile app, and PwC Middle East as its implementation partner. The only public Saudi customer found is Foodics (2023). How much Saudi statutory work (GOSI/Mudad/Nitaqat) it handles natively is disputed, and no data centre inside the Kingdom could be confirmed. Its main value as a benchmark is AI (Sense, then Super Agent with an MCP server, then Cortex, an "AI-native HCM" launched in Aug 2026) and frontline attendance (geofence plus face/liveness checks, WhatsApp notifications, add-on marketplace).

### Cited Findings
**Saudi presence and customers**
- 2022: after its unicorn round, Darwinbox named MENA a key growth market and said it was "staging the opening of its next GCC office in Saudi Arabia" — [Gulf Business, 2022](https://gulfbusiness.com/en/2022/uae/darwinbox-accelerates-mena-expansion-after-leaping-to-unicorn-status/)
- Jan 2023: reported "operations in Riyadh and Dubai" and MENA headcount up 240% since Jan 2022. The company would not give numbers; LinkedIn showed about 13 staff in Dubai and 1 in Riyadh. It planned an Arabic mobile app tailored to MENA employees, and its regional product offers Arabic and configuration to local HR rules — [AGBI, Jan 2023](https://www.agbi.com/tech/2023/01/microsoft-backed-indian-tech-firm-in-mena-expansion/)
- Apr 2023: Saudi restaurant-management and payments platform **Foodics** chose Darwinbox to unify employee operations across several MENA countries. Its HR head credited Arabic support and local adaptation — [Zawya press release](https://www.zawya.com/en/press-release/companies-news/saudi-fintech-foodics-unifies-its-employee-operations-across-mena-with-darwinboxs-hr-tech-platform-ijtyukt0)
- Jan 2024: **PwC Middle East** became Darwinbox's "preferred implementation partner" for Middle East markets — [Channel Post MEA](https://channelpostmea.com/2024/01/26/pwc-middle-east-announces-alliance-with-hcm-platform-darwinbox/)
- A Salesforce Ventures strategic investment was described as funding expansion into the Middle East. The article date did not appear in the results — [Khaleej Times](https://www.khaleejtimes.com/business/tech/darwinbox-raises-strategic-investment-from-salesforce-ventures)

**Saudi payroll and compliance depth (conflicting)**
- A 2026 review says Darwinbox has native payroll support for Saudi Arabia, including GOSI deductions — [hr.software review](https://www.hr.software/reviews/darwinbox)
- Other sources contradict or qualify this. Several 2026 comparison blogs, mostly by competing GCC HR vendors, rate Darwinbox's GOSI/Mudad/Nitaqat support as "partial", "handled via partner add-ons" or "in development". The same blogs rate its Arabic/RTL (and Hijri) support as full — [Hono](https://www.hono.ai/blog/hr-payroll-software-saudi-arabia), [Bayzat](https://www.bayzat.com/blog/best-hr-software-in-saudi-arabia/), [Zimyo](https://www.zimyo.me/insights/top-payroll-software-in-saudi-arabia/), [NeuralHR](https://neuralhr.ai/en/best-payroll-software-saudi-arabia), [The Middle East Insider, Mar 2026](https://themiddleeastinsider.com/2026/03/02/best-hr-software-saudi-arabia-2026-comparison/)
- These sources describe the Saudi compliance chain as one sequence: Qiwa contract authentication, then WPS in Mudad, then GOSI reporting. They also say chronic WPS violations can lower a firm's Nitaqat band. This is the bar any payroll product is judged against — [Hono](https://www.hono.ai/blog/hr-payroll-software-saudi-arabia), [Zimyo](https://www.zimyo.me/insights/top-payroll-software-in-saudi-arabia/)

**Data residency and security**
- Darwinbox publishes material on MENA data-localization laws and says it enables localization for customers in the region. No specific hosting region or provider inside the Kingdom was named in what I found — [Darwinbox blog: PII data localization in MENA](https://blog.darwinbox.com/pii-data-localization-mena)
- An aggregator lists Darwinbox as multi-tenant SaaS holding ISO 27001, SOC 1, SOC 2, GDPR and CCPA compliance. This is unverified against Darwinbox's own trust centre — [ERP Research](https://erpresearch.com/erp-add-ons/hcm-extensions/darwinbox)

**AI features**
- **Darwinbox Sense** powers **Super Agent**, which orchestrates module-level agents across recruitment, payroll, performance, helpdesk and analytics. Super Agent is "powered by our ... Model Context Protocol (MCP) Server" — [Darwinbox blog: Super Agent launch](https://darwinbox.com/en-us/blog/darwinbox-launches-super-agent)
- **4 Aug 2026: Darwinbox Cortex**, an "AI-Native HCM platform". Its Cortex Agent Platform lets agents "reason and execute ... within the existing permissions and governance framework". An Experience Layer spans Microsoft Teams, Copilot, Slack, Glean "and beyond", and Microsoft is a launch partner — [Darwinbox newsroom](https://newsroom.darwinbox.com/darwinbox-launches-cortex-ai-native-hcm-platform)
- Darwinbox cites a library of 30+ function-specific agents — [Darwinbox blog](https://darwinbox.com/blog/10-best-ai-agent-platforms-hr-teams). An analyst notes the Cortex briefing spent "surprisingly little time" on agent counts — [Brandon Hall Group](https://brandonhall.com/enterprise-ai-enters-its-next-phase-what-darwinbox-cortex-tells-us-about-the-future-of-hr/)
- Caveat: one analysis says Darwinbox has not published a technical architecture, API reference, supported-model list or security white paper for Cortex, nor a migration path from Sense/Super Agent — [WindowsForum analysis](https://windowsforum.com/news/darwinbox-cortex-pilots-keep-hr-and-entra-actions-read-only.441600/) (community site; moderate reliability). Agentic AI coverage is also at [diginomica](https://diginomica.com/evolution-action-darwinbox-rapidly-develops-agentic-ai-mass)

**Frontline attendance and mobile**
- Two-step attendance: the employee must first be inside a predefined geofence radius, then a facial scan on their own phone can be added as a second factor — [Darwinbox blog: touch-free attendance](https://blog.darwinbox.com/the-power-of-hr-technology-touch-free-attendance)
- Attendance is marketed for office, home, field and factory workers. Notifications go out through WhatsApp integration and email digests — [Darwinbox time & attendance](https://explore.darwinbox.com/lp/time-and-attendance-us); [Darwinbox shift management (UAE page)](https://explore.darwinbox.com/org/ae/employee-shift-management-system)
- Capterra lists mobile and web clock-ins, geofencing, geo-tagging, and face recognition with AI liveness checks — [Capterra](https://capterra.com/p/150606/Darwinbox-HR/)
- Darwinbox runs an add-on **Marketplace** with apps such as Facial Recognition, Geo-fencing & Geo-tagging, and Virtual ID Cards — [Facial Recognition](https://marketplace.darwinbox.com/en-US/apps/405332/facial-recognition), [Geo-fencing & Geo-tagging](https://marketplace.darwinbox.com/en-US/apps/405338/geo-fencing-geo-tagging/features), [Virtual ID Cards](https://marketplace.darwinbox.com/en-US/apps/405326/darwinbox-virtual-id-cards/overview)

### Inferences
- Darwinbox sells to large enterprises through consulting-led implementation (PwC). In Saudi, its statutory depth is its most disputed area. A local challenger with native GOSI/Mudad/Qiwa/Muqeem flows that customers can verify, plus Nitaqat dashboards, has a credible wedge, especially in mid-market multi-branch businesses that would not run a PwC-led rollout.
- Patterns worth copying: geofence-then-face two-factor clock-in with liveness checks, WhatsApp nudges for approvals and reminders, virtual ID cards, and a marketplace for optional modules.
- Darwinbox's enterprise AI design has three parts: agents act only within existing RBAC, an MCP server exposes HR data and actions to outside AI, and the assistant lives inside Teams/Slack. Shuoon should build its permission model to be safe for agents from the start.
- Since most of the "partial support" ratings come from Darwinbox's competitors, treat them as directional, not proven.

### Gaps
- No confirmation of a Darwinbox data centre or cloud region inside KSA. This needs vendor confirmation.
- No named Saudi customers from 2024–2026 beyond Foodics, and the current status of the Riyadh office is unclear.
- Whether Darwinbox integrates directly with Mudad/GOSI APIs or generates files remains unverified, with sources conflicting.
- Darwinbox pricing is not public. SAML/SSO, audit-log and API details did not surface in search.

---

## Q2. Zoho People + Zoho Payroll (KSA edition): GOSI, WPS/Mudad, EOSB, SAR pricing, KSA data centres, Arabic

### Takeaway
Zoho sets the low-price and data-residency anchor. Its Saudi payroll edition is bilingual (Arabic/English) and covers GOSI including SANED, end-of-service benefit (EOSB) calculation, WPS wage files for Mudad, Saudization guidance and Zoho Books journal entries. It is priced from **SAR 35/org/month including 5 employees, plus SAR 7–15 per extra employee**, and hosted in Zoho's **Jeddah and Riyadh data centres (announced Mar 2024)**. Zoho People adds geofenced/IP-restricted attendance, a face-recognition kiosk and shift scheduling, mostly in higher tiers.

### Cited Findings
**KSA data centres**
- Zoho Corp opened "its first Middle East data centres" in **Jeddah and Riyadh**, announced in March 2024 at LEAP. The sites are fully operational and bring Zoho to 18 data centres worldwide. Their purpose is to keep local data inside the Kingdom under the PDPL. Saudi customers' data was to be migrated "in the coming quarters" — [ManageEngine / Zoho Corp release, 4 Mar 2024](https://manageengine.com/news/zohocorp_opening_first_middle_east_data_centres_saudi_arabia.html); [Intelligent CIO](https://www.intelligentcio.com/me/2024/03/05/zoho-corp-announces-the-opening-of-its-first-middle-east-data-centres-in-saudi-arabia/); [W.Media](https://w.media/zoho-corp-opens-two-new-data-centers-in-saudi-arabia/)
- Zoho pledged about SAR 500m (~$133m) under Vision 2030 — [StartUp Bahrain](https://startupbahrain.com/news/tech-giant-zoho-invest-133-million-into-saudi-expansion). CEO Sridhar Vembu called KSA Zoho's fastest-growing MENA market — [Gulf Business](https://gulfbusiness.com/?p=281087)
- A Zoho reseller interview says Saudi Payroll data is stored in Saudi data centres — [Arabian Reseller interview](https://arabianreseller.com/p0ls)
- Conflict: a MIT Sloan Management Review ME headline reads "Zoho Launches First Middle East Data Centers in UAE" (undated in results). Zoho Corp's 2024 release calls the Saudi sites its "first Middle East data centres" — [MIT Sloan ME](https://www.mitsloanme.com/?p=13883) vs [ManageEngine release](https://manageengine.com/news/zohocorp_opening_first_middle_east_data_centres_saudi_arabia.html). This may reflect announcement-versus-opening timing and is unresolved. It does not change the fact that KSA hosting exists.

**Zoho Payroll KSA features**
- The Saudi edition "is bilingual and supports both English and Arabic", with **bilingual payslips** after every pay run. The Zoho Books integration posts **automated journal entries for each pay period** — [Zoho blog: "Zoho Payroll is now live in Saudi Arabia"](https://zoho.com/blog/payroll/introducing-zoho-payroll-for-saudi-arabia.html)
- **GOSI**: monthly contributions for Saudi and non-Saudi workers covering pensions, occupational hazards and unemployment insurance (SANED). **EOSB/gratuity** is calculated automatically from contract type, years of service and reason for termination — [MENAFN press release: Zoho Launches Saudi Edition of Zoho Payroll](https://menafn.com/1109453116/Zoho-Launches-Saudi-Edition-Of-Zoho-Payroll)
- **WPS**: auto-generated wage files meant to meet Saudi WPS requirements — [Zoho Payroll KSA features](https://www.zoho.com/en-sa/payroll/features). Wage files are "to submit to Mudad". The product also handles monthly social-security contributions for other GCC nationals, and Zoho Books is described as ZATCA-approved — [Arabian Reseller interview](https://arabianreseller.com/p0ls)
- **Saudization**: a knowledge-base article explains the quota logic, which depends on the count of Saudi staff, total headcount and registered sector — [Zoho Payroll KB: Saudization](https://zstatic.zohostatic.com/en-sa/payroll/kb/employer/general/saudization.md)
- **Bundling**: the KSA edition (with the USA edition) was added to **Zoho One**, after Payroll had been "available only in India and the UAE". Community threads also mention later Kuwait, Oman, Qatar, Bahrain and Canada editions; the exact post URL was not isolated — [Zoho community announcement](https://help.zoho.com/portal/en-gb/community/topic/zoho-payrolls-usa-and-ksa-editions-are-available-in-zoho-one?page=26)
- A partner's marketing page claims automatic GOSI deductions and pre-filled WPS salary files for Mudad upload — [Al-Fahad (Zoho partner)](https://www.al-fahad.biz/zoho-hr-for-saudi-arabia-managing-iqama-gosi-and-saudisation-in-one-place/)

**Zoho Payroll KSA pricing (SAR; extracted by search engine, re-verify live)**

| Plan (billed annually) | Base price / org / month | Employees included | Each additional employee / month |
|---|---|---|---|
| Standard | SAR 35 | 5 | SAR 7 |
| Professional | SAR 55 | 5 | SAR 11 |
| Premium | SAR 75 | 5 | SAR 15 |

- Source for the table: plans include end-of-service calculation, GOSI and other Gulf pension calculation, and WPS wage-file download — [Zoho Payroll KSA pricing comparison](https://www.zoho.com/en-sa/payroll/pricing-comparison)

**Zoho People: attendance and scheduling**
- **Facial-recognition attendance, People Kiosk and biometric-device integrations start at the Professional tier.** Shift scheduling is in the lower paid tier; shift rotation and patterns start at Professional — [Zoho People pricing comparison](https://www.zoho.com/people/pricing-comparison.html)
- IP restriction and **geo-fencing** control where employees can check in. People Kiosk matches a captured photo to the employee's profile picture — [Zoho People attendance management](https://www.zoho.com/people/attendance-management-system.html?src=ft)
- The Saudi site has a Zoho People + Zoho Payroll integration page — [Zoho (en-sa)](https://www.zoho.com/en-sa/people/zoho-people-and-zoho-payroll-integration.html)
- A directory lists a USD starting price of about $1.50/user/month for Zoho People; no SAR price was found — [Software Advice](https://www.softwareadvice.com/hr/zoho-people-profile)

### Inferences
- Zoho's price floor is very low. Worked example from the price list above: 50 employees cost **SAR 350/month on Standard (~SAR 7/employee), SAR 550 on Professional (~SAR 11/employee), SAR 750 on Premium (~SAR 15/employee)**. Shuoon must either match this at entry level or justify a premium with deeper Saudi integrations (direct Mudad/GOSI/Qiwa/Muqeem rather than file export), multi-branch frontline operations (scheduling, kiosk, geofencing per branch) and Arabic-first service.
- Zoho has hosted inside the Kingdom since 2024, so local hosting is now a baseline requirement for selling to regulated Saudi buyers.
- Zoho's flow appears to be "generate the WPS file, upload it to Mudad". If direct submission is technically possible, it is a differentiator. Another researcher should verify Mudad/GOSI API availability.
- Zoho Payroll connects natively to Zoho Books. Businesses on Qoyod, Daftra or Odoo are not served out of the box, which is an opening for a challenger that is neutral about accounting systems.
- Bilingual payslips and a dual-language UI are table stakes, and Zoho already ships them at a low price.

### Gaps
- Zoho People SAR pricing was not found.
- The exact Zoho Payroll KSA launch date was not confirmed; it came after the India and UAE editions.
- Monthly-billing SAR prices are unverified. One third-party guide implies SAR 90 for Premium billed monthly, but it could not be attributed reliably.
- Whether Zoho submits directly to Mudad/GOSI or only produces files is unclear.
- Iqama/Muqeem expiry tracking in Zoho People is unconfirmed.
- Nothing was found on Zia (Zoho AI) features specific to People or Payroll in KSA.
- zoho.com could not be fetched directly in this session.

---

## Q3. Deel and Rippling in KSA: EOR vs native payroll, relevance to Saudi SMEs, pricing

### Takeaway
Both are global-employment platforms, not Saudi-native payroll engines. **Deel** offers Saudi **EOR** at roughly **$599–$999 per employee per month** (sources conflict), plus **Global Payroll** for companies that have their own Saudi entity. **Rippling**'s own Saudi page covers **contractors only**, and Saudi EOR or payroll support could not be confirmed. They matter to foreign companies entering KSA without an entity, not to Saudi SMEs with their own commercial registration (CR). For Shuoon they are benchmarks for AI, UX, integrations and security, not for localization.

### Cited Findings
**Deel**
- Deel's Saudi page says its EOR handles local law, tax, benefits and payroll. Hiring in Saudi normally requires an entity, meaning a local office, a registered address and a local bank account. Companies that have an entity can use **Deel Global Payroll** for direct employees. Deel claims average Saudi onboarding of **20 days** — [Deel: Hire employees in Saudi Arabia](https://www.deel.com/hiring/employees/saudi-arabia/)
- The same page (as extracted by search) gives these figures:
  - estimated employer cost of **2.40%–12.85%** for expat employees
  - a fixed **Ajeer fee of SAR 46**
  - an estimated "nationalization fee" of **about SAR 3,000** for expat employees
  - Deel manages GOSI contributions, Saudisation rules and labour law
  - employer GOSI of **10.575% of gross or 11.75% of basic + housing, capped at SAR 45,000/month**, for employees who entered the job market **before 3 July 2024** (meaning newer entrants fall under a different scheme) — [Deel](https://www.deel.com/hiring/employees/saudi-arabia/)
- **EOR fee conflict.** About **$999/month** is attributed to Deel's Saudi page and some reviews. Other roundups cite Deel's standard **$599/month billed annually ($699 monthly)** — [Deel](https://www.deel.com/hiring/employees/saudi-arabia/); [FirstHR comparison](https://firsthr.app/compare/payroll/employer-of-record-saudi-arabia); [HireBorderless](https://www.hireborderless.com/post/employer-of-record-services-in-saudi-arabia). I could not open these pages to confirm which figure each one states.
- Deel Global Payroll is listed **from $29/employee/month** — [OneGlobalPayroll](https://oneglobalpayroll.com/best/global-payroll-saudi-arabia/)
- Saudi accounting software Qoyod's marketplace has a **Deel** listing under HR & Payroll; its details were not verified — [Qoyod marketplace: Deel](https://www.qoyod.com/en/marketplace/hr-payroll/deel/)
- Security: Deel says it is SOC 2 certified with an annual audit (report on request) and ISO 27001 certified (certificate and Statement of Applicability on request) — [Deel privacy & security](https://www.deel.com/en-gb/privacy-and-security/)

**Rippling**
- Rippling's Saudi country page is "Hire contractors in Saudi Arabia", meaning onboarding and paying Saudi contractors in one system — [Rippling](https://Rippling.com/country-hiring/saudi-arabia-contractors)
- Rippling EOR was "live in 80 countries" as of March 2025. Saudi Arabia was not confirmed in the results — [Rippling blog, Mar 2025](https://www.rippling.com/blog/eor-updates-march-2025)
- Two global models are offered: Rippling EOR, or payroll through your own entities. Rippling claims "5 days to payday in popular markets, 12 days in less common markets" — [Rippling international payroll](https://www.rippling.com/en-SG/international-payroll)
- Pricing is quote-based with no published per-employee rates. About $8/user/month is a third-party estimate that multiplies across modules — [aiproductivity.ai](https://aiproductivity.ai/tools/rippling/); [Iden](https://www.idenhq.com/scim-tax/rippling)
- Biased views: competitor TopSource (Jul 2026) argues Rippling's depth is in US payroll/HR/IT, with global payroll and EOR as newer add-on layers — [TopSource](https://topsourceworldwide.com/insights/best-rippling-alternatives-eor-global-payroll.md). Competitor Asanify claims Rippling automates EOR in Saudi — [Asanify](https://asanify.com/blog/employer-of-record-saudi-arabia/top-employer-of-record-service-providers-in-saudi-arabia/). Both are weak evidence.

### Inferences
- Scale of the price gap: Deel EOR at $599–$999 is about **SAR 2,250–3,750 per employee per month** at the fixed 3.75 peg. Zoho costs SAR 7–15 per employee per month. EOR is a different category and does not fit Saudi SMEs that already have a CR. It fits foreign headquarters, RHQ set-ups and companies testing the market.
- Deel's Saudi page shows estimated GOSI, Ajeer and nationalization costs up front. That is a strong marketing pattern. A public **"true cost of an employee in KSA" calculator** (GOSI by cohort, expat levy, Ajeer, medical insurance, EOSB accrual) would be a natural acquisition tool for Shuoon.
- Possible coexistence: global firms may run Deel or Rippling as the global HR system of record while needing a Saudi-native payroll engine for branches. An import/export or API bridge to Deel and Rippling could be a partnership play.
- Because GOSI rates depend on when an employee first entered the system (before or after 3 July 2024, per Deel), the payroll engine needs per-employee cohort logic. This is a compliance detail global tools surface, and a challenger must automate it.

### Gaps
- Rippling's Saudi EOR or native payroll coverage could not be confirmed.
- Deel's exact Saudi EOR price is unconfirmed because the page fetch was blocked.
- What Deel's "nationalization fee" (~SAR 3,000) covers is unclear; it may be the expat levy (maqabil) or something else.
- No evidence was found on whether Deel or Rippling hold a Saudi entity or RHQ licence.
- No source covered Arabic UI or data residency for Deel or Rippling.

---

## Q4. Frontline-workforce tools (Deputy, Connecteam, Homebase): scheduling, time clock, communications, tasks, mobile UX, pricing

### Takeaway
These three set the bar for frontline UX:
- **Deputy**: demand-driven auto-scheduling (from sales data, optimizing for cost or fairness), an iPad kiosk with face verification, and swap/open-shift flows with rules-based auto-approval. Priced per user, $5–$9.
- **Connecteam**: an all-in-one mobile app combining time clock, scheduling, chat, forms/checklists and tasks. Free for up to 10 users; paid plans sold per hub in 30-user bundles.
- **Homebase**: small-business simplicity priced **per location with unlimited employees**. Free for 1 location and up to 10 staff.
None of them offers Saudi payroll. Arabic support was not verified.

### Cited Findings
**Deputy**
- Pricing: **Lite $5, Core $6.50, Pro $9 per user/month** — [LeadChange](https://leadchangegroup.com/software/deputy/pricing/). Auto-scheduling, demand forecasting and micro-scheduling are reported as **Core and Pro only**; Lite covers manual scheduling and time tracking — [LeadChange](https://leadchangegroup.com/software/deputy/pricing/); [Compare-SaaS](https://www.compare-saas.com/business-software/deputy-pricing). Per-detail attribution across trackers was not verified.
- No permanent free plan; a free trial is available — [G2](https://www.g2.com/products/deputy/pricing)
- The **iPad Kiosk** includes facial verification to stop "buddy punching". A touchless mode uses facial recognition and voice commands for clock-in and clock-out — [Deputy Kiosk](https://www.deputy.com/au/features/kiosk). The mobile app records a **GPS location stamp** — [Deputy time clock](https://www.deputy.com/features/time-clock)
- Staff can **swap shifts or claim open shifts**. Approval goes to a manager, or Deputy can "automatically approve within business rules". The kiosk syncs with rostering and rest-break compliance rules — [Deputy employee time clock](https://www.deputy.com/au/features/employee-time-clock)
- Schedules can be filled against **demand forecasts driven by sales data** and optimized for **lowest cost or even distribution of hours**. Configurable **clock-in buffers** around rostered shifts allow managers to approve exceptions — Deputy feature and partner listings returned in search ([Deputy time clock](https://www.deputy.com/features/time-clock), [Deputy for ADP Workforce Now](https://apps.adp.com/en-US/apps/98199/deputy-for-adp-workforce-now/features)). A review cites automatic wage calculation from real-time timesheets — [Dupple review, Jul 2026](https://dupple.com/reviews/deputy)
- Deputy's newsroom headline: "1 billion shifts scheduled using Deputy" — [Deputy newsroom](https://news.deputy.com/1-billion-shifts-scheduled-using-deputy)
- Deputy plugs into payroll ecosystems instead of running payroll itself, for example "Deputy for RUN Powered by ADP" — [ADP Marketplace](https://apps.adp.com/apps/187224/deputy-for-run-powered-by-adp)

**Connecteam**
- Pricing:
  - A **free Small Business plan for up to 10 users** across all hubs — [ClockOut, checked 15 Oct 2026](https://useclockout.com/blog/connecteam-pricing)
  - Paid tiers are sold per hub and priced for the first 30 users: **Basic $29/mo annual ($35 monthly), Advanced $49 ($59), Expert $99 ($119)**; Enterprise is custom — [CostBench](https://costbench.com/software/employee-scheduling/connecteam/)
- **Geofencing tier conflict.** Capterra and Software Advice list a geofence on Basic. ClockOut and Clox say geofencing starts at **Advanced** (about 10 geofenced sites), with **unlimited sites on Expert**, while GPS stamps on punches start at Basic — [Capterra](https://www.capterra.com/p/153140/Connecteam/); [Clox](https://getclox.com/blog/free-geofencing-time-clock-apps); [ClockOut review](https://useclockout.com/blog/connecteam-review)
- The **kiosk is on all plans, including free**. It is a dedicated shared-device app with **auto-generated unique PINs, mandatory selfie capture and auto clock-out** — [BrainSensei review](https://brainsensei.com/connecteam-time-clock-app-review/); [Connecteam: best time clock kiosk apps](https://connecteam.com/best-time-clock-kiosk-apps/). True face recognition is **not confirmed**; only a "Biometric Recognition" tag appears in Software Advice data — [Software Advice](https://www.softwareadvice.com/hr/connecteam-profile/)
- **Two-way swap flow**: a coworker agrees first, then the request goes to the manager. A separate **shift replacement** option hands the shift off entirely — [Connecteam help center](https://help.connecteam.com/en/articles/16644414-let-s-settle-this-once-and-for-all-shift-swap-or-shift-replacement)
- Third-party reviews report the following; per-tier attribution is not verified — [actiTIME review](https://www.actitime.com/software-collections/connecteam-review); [People Managing People review](https://peoplemanagingpeople.com/it/tools/recensione-connecteam/); [Connecteam AI / scheduling page](https://connecteam.com/shift-scheduling-software):
  - open shifts can be claimed first-come or with manager approval
  - built-in team chat, including chat polls
  - customizable forms and checklists for daily checklists, inspections and reports
  - tasks can be assigned within a shift or standalone, with subtasks
  - **AI auto-scheduling** and an **AI chat agent** are Expert-tier features
- Like Deputy, Connecteam integrates into payroll ecosystems, for example "Connecteam for RUN Powered by ADP" — [ADP Marketplace](https://apps.adp.com/en-US/apps/469968/connecteam-for-run-powered-by-adp/features)

**Homebase**
- Pricing is **per location**:
  - **Basic free** (1 location, up to 10 employees)
  - **Essentials $30/mo (~$24 billed annually)**
  - **Plus $70 (~$56)**
  - **All-in-One $120 (~$96)**, which adds onboarding, labour-cost management and HR & compliance
  - Paid tiers include **unlimited employees per location**. Payroll is a separate add-on; one recent capture shows a $49 payroll fee — [ERP Research](https://www.erpresearch.com/erp-add-ons/time-attendance/homebase/pricing); [CostBench](https://costbench.com/software/employee-scheduling/homebase); [PricingSaaS](https://pricingsaas.com/companies/joinhomebase)
- Homebase's own pages describe these features:
  - self-managed swaps and trades ("just tap to approve")
  - an **AI Scheduling Assistant** credited with "400,000+ shift reassignments" (vendor claim)
  - clock-in for hours and breaks from personal phones **within a geofence**
  - **real-time alerts for late, early or missed clock-ins**
  - 1:1 and group messaging that "keeps work conversations separate from personal texts"
  - Sources: [Homebase vs 7shifts](https://www.joinhomebase.com/compare/homebase-vs-7shifts); [Homebase vs OnTheClock](https://www.joinhomebase.com/compare/homebase-vs-ontheclock); [Homebase app](https://joinhomebase.com/app/?r=pmp-bhra)
- Paid plans add GPS clock-ins, advanced scheduling, PTO management and team messaging — [Homebase vs OnTheClock](https://www.joinhomebase.com/compare/homebase-vs-ontheclock)

### Inferences
Frontline UX patterns a Saudi multi-branch challenger should adopt:
- **Time clock**:
  - a geofence for each branch, with GPS stamps on every punch
  - a selfie or face check with liveness on personal phones; Darwinbox's two-step version is in Q1
  - a **shared-tablet kiosk** with PIN plus selfie or face verification for staff without smartphones
  - **auto clock-out**, plus **clock-in buffers** tied to the roster with exception approval
  - real-time alerts for late, missed or early punches
- **Scheduling**:
  - templates
  - open shifts that staff can claim (first-come or approved)
  - **two-way swaps** (coworker consent, then manager approval) and **replacements**
  - rules-based auto-approval, for example within overtime and rest limits
  - **demand-based auto-scheduling from POS sales**. In KSA the obvious data sources are restaurant and retail POS systems such as Foodics; this is an inference, not a researched integration.
  - optimization goals such as "lowest cost" versus "fair hours"
  - labour cost shown as a percentage of sales while editing the schedule
- **Communications**: in-app chat and announcements kept separate from personal messaging, plus polls. In KSA, WhatsApp notifications are an extra channel for reaching staff (Darwinbox ships them).
- **Tasks**: shift-linked checklists and forms (opening and closing, cleaning, inspections) with photo evidence. This turns an HR app into a daily operations app and drives daily use.
- **Pricing and packaging**:
  - a free tier for 10 or fewer users drives bottom-up adoption (Connecteam, Homebase)
  - **per-branch pricing with unlimited employees** (Homebase) suits multi-branch SMEs with high staff turnover
  - per-user pricing (Deputy) suits enterprises
  - advanced features are gated in all three: auto-scheduling at Deputy Core, geofencing at Connecteam Advanced, face kiosk at Zoho People Professional
- Worked comparisons: 5 branches on Homebase Plus (annual) ≈ 5 × $56 = $280/month (~SAR 1,050), unlimited staff. 100 users on Deputy Core = $650/month (~SAR 2,440).
- Shuoon's bundling choice: the global frontline tools are workforce-management layers that rely on payroll partners (ADP marketplace pattern). A Saudi challenger can combine frontline workforce management with native Saudi payroll in one product, which none of these three offer in KSA.

### Gaps
- Arabic/RTL and Hijri support in Deputy, Connecteam and Homebase was not verified, nor whether they sell actively in KSA. This should be checked with the vendors.
- Deputy's enterprise tier pricing was not found.
- Connecteam pricing above 30 users per hub was not researched.
- Whether Connecteam does true face recognition is unconfirmed.
- Whether Homebase can assign geofences per individual or role is unverified; one reviewer said it cannot, but the source could not be attributed.
- No independent data on labour-cost savings from auto-scheduling.

---

## Q5. AI features across these platforms (HR copilots, payroll/attendance anomaly detection, scheduling optimisation, document extraction)

### Takeaway
In 2025–26 the bar moved from "chatbot Q&A" to **agentic workflows with human approval**. Examples include anomaly detection before payroll runs (Deel's Payroll Detective; Rippling AI checking timesheets against payroll), natural-language scheduling (Deputy AI), AI auto-scheduling (Connecteam Expert, Homebase), and orchestration agents exposed through MCP and chat apps (Darwinbox Super Agent/Cortex; Deel inside ChatGPT). Document extraction (IDs, Iqama, contracts) did not appear as a headline feature in what I found.

### Cited Findings
- **Deel AI Workforce**: beta in Aug 2025 with seven agents, including **Payroll Detective**, which flags payroll anomalies before payout by checking every variable against set rules and thresholds, and **PTO Fairy**, which handles time-off requests — [Workplace Journal, Aug 2025](https://workplacejournal.co.uk/2025/08/deel-launches-ai-workforce-to-support-hr-and-payroll-teams/); [People Matters ME](https://me.peoplemattersglobal.com/news/hr-technology/deel-rolls-out-ai-workforce-heres-how-its-bringing-ai-agents-to-workflows-46535)
- **The Big Deel (19 Mar 2026)**: proactive AI agents across hiring, onboarding, payroll, IT and compliance. Deel calls itself the "first B2B HR and payroll app in ChatGPT". Customers can build custom agents trained on their own handbook and policies, and compensation decisions flow automatically into payroll — [Deel blog: Big Deel recap 2026](https://www.deel.com/blog/big-deel-recap-2026/)
- **Rippling AI**: because payroll, benefits, time and performance data sit together, Rippling AI can "investigate deductions, surface flight risks, flag burnout patterns" — [Rippling resource](https://www.rippling.com/resources/how-ripplings-hr-team-uses-rippling-ai). A Rippling product called **Talent Signal** is noted by an analyst — [Josh Bersin](https://joshbersin.com/tag/rippling/). A secondary roundup says Rippling AI checks timesheets and attendance before they become payroll errors, and names ADP Assist and Deel's Payroll Detective as leaders in pre-run anomaly detection — [Rework, Mar 2026](https://resources.rework.com/tools/ai-agents/best-ai-agents-for-payroll-2026)
- **Deputy AI**: in beta, with a broader rollout planned for 2026. It is mobile-first for frontline workers and shift managers and can "build, edit, and adjust schedules instantly using natural language". It uses schedules, timesheets, employee records and compliance rules, and is built on AWS generative AI services. The CEO calls it "a shift from smart scheduling to agentic workforce orchestration" — [Deputy newsroom: AI platform on AWS](https://news.deputy.com/deputy-launches-new-ai-platform-on-aws-to-transform-how-businesses-manage-shift-work); [Deputy newsroom: Deputy AI](https://news.deputy.com/deputy-ai-is-the-intelligent-trusted-teammate-for-managing-shift-based-businesses); [Deputy blog](https://www.deputy.com/blog/meet-your-new-on-shift-teammate-deputy-ai)
- **Darwinbox**: Sense, Super Agent with an MCP server, and Cortex with permission-scoped agents delivered through Teams/Copilot/Slack/Glean; details are in Q1 — [Darwinbox newsroom](https://newsroom.darwinbox.com/darwinbox-launches-cortex-ai-native-hcm-platform); [Darwinbox blog](https://darwinbox.com/en-us/blog/darwinbox-launches-super-agent)
- **Connecteam**: AI auto-scheduling and an AI chat agent, reported as Expert-tier — [actiTIME review](https://www.actitime.com/software-collections/connecteam-review); [Connecteam AI page](https://connecteam.com/shift-scheduling-software). **Homebase**: AI Scheduling Assistant, "400,000+ shift reassignments" (vendor claim) — [Homebase vs 7shifts](https://www.joinhomebase.com/compare/homebase-vs-7shifts)
- **Face/liveness AI** for attendance: Darwinbox lists AI-powered liveness checks — [Capterra](https://capterra.com/p/150606/Darwinbox-HR/). Deputy offers kiosk face verification — [Deputy Kiosk](https://www.deputy.com/au/features/kiosk)

### Inferences
AI features Shuoon should prioritise, ordered by value against feasibility:
1. **Pre-run payroll anomaly checks** that explain their findings. Rules plus machine learning would flag month-on-month variances, GOSI wage mismatches, missing attendance, overtime spikes, unpaid leave without approval, and gaps between the WPS file and payroll before submission. This copies Deel's Payroll Detective pattern for Saudi specifics.
2. **Arabic natural-language scheduling and HR Q&A**: an assistant trained on the company handbook and the Saudi Labour Law, available on mobile and WhatsApp. This combines the Deputy AI and Deel custom-agent patterns.
3. **Attendance anomaly and fraud detection**: geofence plus face liveness, and flags for buddy punching or impossible travel.
4. **Agent governance from day one**: agents act only within the user's role permissions, with human approval for payroll-affecting actions and an audit trail of agent actions (Darwinbox Cortex and Deel patterns). An **MCP server or public API** would let customers plug Shuoon into their own AI tools.
5. **Document extraction** (Iqama, passport, contracts, medical certificates for sick leave) is a white space. I found no global vendor promoting it for KSA, so it could be a differentiator. Demand for it is unvalidated.

### Gaps
- No evidence on document-extraction or OCR features at these vendors for Saudi documents.
- No information on whether any vendor's AI features work in Arabic.
- No independent accuracy or ROI data for payroll anomaly agents; all claims are vendor- or roundup-sourced.
- Zoho Zia features in People/Payroll were not found.

---

## Q6. Enterprise expectations: SSO/SAML, audit logs, RBAC, APIs/webhooks, integration marketplaces (Odoo, QuickBooks, Zoho Books, Qoyod/Daftra), ISO 27001/SOC 2

### Takeaway
Enterprise buyers now expect the following from global vendors: SAML SSO with SCIM provisioning (often a paid add-on), ISO 27001 plus SOC 2 Type II reports available on request, sometimes ISO 27018 or ISO 42001 for AI, and large integration marketplaces (Rippling claims 650+ apps; Darwinbox has its own marketplace). In KSA the de facto SME accounting standard is **Qoyod's marketplace**. Its existing HR and payroll connectors (Jisr, Idaratech, Malachite, Deel, Mudad) set the bar: a direct API link that **posts payroll journal entries on approval**, with an encrypted API key and an activity log. No Daftra HR or payroll connector was found.

### Cited Findings
**SSO, provisioning and security certifications**
- Rippling supports custom app integrations with **SAML SSO and SCIM or JIT provisioning** — [Rippling SSO & provisioning](https://www.rippling.com/paid-sso-provisioning). Sources conflict on SCIM: Iden says the identity module costs about **$8/user/month for SSO+SCIM on top of the base HRIS** — [Iden](https://www.idenhq.com/scim-tax/rippling). Stitchflow (Jan 2026) says Rippling lacks native SCIM — [Stitchflow](https://www.stitchflow.com/scim/rippling)
- Rippling is **ISO 27001 and ISO 27018 certified** — [TechRadar review](https://www.techradar.com/pro/rippling-it-iam-solution-review). A third-party guide marked as AI-drafted (low reliability) also lists SOC 1 Type II, SOC 2 Type II, **ISO 42001** and CSA STAR Level 2 via the Rippling Trust Center — [howtoharden.com](https://howtoharden.com/guides/rippling/)
- Rippling's **App Shop lists 650+ integrations**; other sources cite 600+ or 800+ — [Rippling integrations](https://www.rippling.com/platform/integrations); [TechRadar](https://www.techradar.com/pro/rippling-it-iam-solution-review)
- Deel is **SOC 2 certified (annual audit; report on request)** and **ISO 27001 certified (certificate and SoA on request)** — [Deel privacy & security](https://www.deel.com/en-gb/privacy-and-security/). The SOC 2 audit covered security, availability and confidentiality — [Deel blog (ES)](https://www.deel.com/es/blog/deel-cumple-con-la-norma-soc2)
- Darwinbox holds ISO 27001, SOC 1 and SOC 2 per an aggregator — [ERP Research](https://erpresearch.com/erp-add-ons/hcm-extensions/darwinbox). Cortex agents act "within the existing permissions and governance framework" — [Darwinbox newsroom](https://newsroom.darwinbox.com/darwinbox-launches-cortex-ai-native-hcm-platform). Darwinbox also runs its own app **Marketplace** — [Darwinbox Marketplace](https://marketplace.darwinbox.com/en-US/apps/405332/facial-recognition)

**Accounting integrations relevant to KSA**
- **Zoho**: Payroll posts automated journal entries to **Zoho Books** each pay period — [Zoho blog](https://zoho.com/blog/payroll/introducing-zoho-payroll-for-saudi-arabia.html). Zoho Books is described as ZATCA-approved — [Arabian Reseller](https://arabianreseller.com/p0ls). Zoho has an Arabic KB page for the Books integration — [Zoho KB (ar-sa)](https://www.zoho.com/ar-sa/payroll/kb/employer/zoho-books-integration/)
- **Qoyod's HR & Payroll marketplace** includes:
  - **Jisr**, a direct API link that posts payroll runs into Qoyod and complements Qoyod's own Payroll add-on — [Qoyod marketplace: Jisr](https://www.qoyod.com/en/marketplace/hr-payroll/jisr/); [Qoyod KB: Jisr integration](https://www.qoyod.com/en/knowledge-base/integrations/integration-jisr/)
  - **Idaratech**, connected with an API key; the journal entry is created automatically in Qoyod once payroll disbursement is approved in Idaratech — [Qoyod marketplace: Idaratech](https://www.qoyod.com/en/marketplace/hr-payroll/idaratech/)
  - **Malachite**, a direct integration taking about 5 minutes to set up, with an encrypted API key, HTTPS and a complete activity log — [Qoyod marketplace: Malachite](https://www.qoyod.com/en/marketplace/hr-payroll/malachite/); [Qoyod Academy: Malachite](https://academy.qoyod.com/en/marketplace/hr-payroll/malachite/)
  - **Deel** — [Qoyod marketplace: Deel](https://www.qoyod.com/en/marketplace/hr-payroll/deel/)
  - Mudad is also listed under HR & payroll — [Qoyod integrations overview](https://www.qoyod.com/en/knowledge-base/integrations/integrations-overview/)
- Qoyod also sells its own **Qoyod HR**, a standalone subscription that links to Qoyod Accounting. This makes it both a channel and a competitor — [Qoyod HR](https://www.qoyod.com/en/qhr/)
- **Daftra**: no HR or payroll connector found. Apideck lists Qoyod as "not yet supported" on its integration radar, so unified-API coverage of Saudi accounting tools is thin — [Apideck: Qoyod](https://www.apideck.com/accounting-software/qoyod.md)

### Inferences
- **Must-haves before enterprise or regulated deals**:
  - SAML SSO (Azure AD/Entra, Google) and SCIM
  - fine-grained RBAC scoped by branch, entity and cost centre
  - immutable audit logs, including AI-agent actions
  - ISO 27001 first, then SOC 2 Type II; ISO 27018 or 42001 later for differentiation
  - hosting inside the Kingdom with a PDPL posture (Zoho sets this bar)
  - a documented REST API with webhooks
  - Global vendors make security reports available "on request", and Saudi buyers will expect the same.
- **Integration priority for Saudi SMEs**: a Qoyod marketplace listing is table stakes, since direct competitors Jisr, Idaratech and Malachite are already there. Copy the pattern of auto-posting the journal entry on payroll approval, with mapping by cost centre and branch. Daftra and Odoo look like underserved gaps worth validating; Zoho Books matters for businesses in the Zoho ecosystem. QuickBooks's relevance in KSA was not researched.
- Gating SSO/SCIM as a paid add-on (as Rippling reportedly does) is normal globally. A challenger could include SSO in a mid-tier plan as a differentiator for mid-market buyers.

### Gaps
- Audit-log and RBAC specifics for each vendor were not researched in depth.
- Darwinbox and Zoho SAML/SCIM details did not surface.
- Deel API, webhook and SSO details were not found in search.
- Odoo and QuickBooks connectors for the global vendors were not verified.
- No data on which accounting systems Saudi SMEs use most (market share); other researchers may cover this.

---

## Q7. Synthesis: what a Saudi challenger (Shuoon) should adopt from these benchmarks, and where they leave room

### Takeaway
None of the global benchmarks combines all of the following: **native, verifiable Saudi compliance** (GOSI by cohort, Mudad/WPS, EOSB, Nitaqat, Qiwa/Muqeem), **hosting inside the Kingdom**, **Arabic-first mobile frontline workforce management** (scheduling, geofence/face clock, kiosk, chat, checklists) and **neutrality across Saudi accounting systems** (Qoyod, Daftra, Odoo, Zoho Books).
- Zoho is the closest on localization and price, but it is tied to its own ecosystem and light on frontline workforce management.
- Darwinbox targets enterprise, and its Saudi statutory depth is disputed.
- Deel and Rippling are EOR and global payroll.
- Deputy, Connecteam and Homebase are best-in-class on frontline UX but do not offer Saudi payroll.

### Cited Findings
- Zoho: Arabic/English UI and bilingual payslips; GOSI incl. SANED; EOSB; WPS files for Mudad; SAR 35–75/org/month plus SAR 7–15 per employee; Jeddah and Riyadh data centres — [Zoho blog](https://zoho.com/blog/payroll/introducing-zoho-payroll-for-saudi-arabia.html); [MENAFN](https://menafn.com/1109453116/Zoho-Launches-Saudi-Edition-Of-Zoho-Payroll); [Zoho KSA pricing](https://www.zoho.com/en-sa/payroll/pricing-comparison); [ManageEngine release](https://manageengine.com/news/zohocorp_opening_first_middle_east_data_centres_saudi_arabia.html)
- Darwinbox: Saudi statutory depth disputed; enterprise/PwC channel; agentic AI with an MCP server — [hr.software](https://www.hr.software/reviews/darwinbox) vs [Hono](https://www.hono.ai/blog/hr-payroll-software-saudi-arabia); [Channel Post MEA](https://channelpostmea.com/2024/01/26/pwc-middle-east-announces-alliance-with-hcm-platform-darwinbox/); [Darwinbox Super Agent](https://darwinbox.com/en-us/blog/darwinbox-launches-super-agent)
- Deel: Saudi EOR plus Global Payroll for companies with an entity; transparent cost estimates on its country page — [Deel Saudi page](https://www.deel.com/hiring/employees/saudi-arabia/)
- Rippling: Saudi page covers contractors only — [Rippling](https://Rippling.com/country-hiring/saudi-arabia-contractors)
- Frontline bar: rules-based auto-approval of swaps and open shifts, demand forecasts from sales, face-verified kiosk (Deputy) — [Deputy](https://www.deputy.com/au/features/employee-time-clock); a free 10-user tier with kiosk, PIN, selfie and auto clock-out (Connecteam) — [BrainSensei](https://brainsensei.com/connecteam-time-clock-app-review/); per-location pricing with unlimited staff (Homebase) — [ERP Research](https://www.erpresearch.com/erp-add-ons/time-attendance/homebase/pricing)
- Accounting integration bar in KSA: Qoyod connectors that auto-post payroll journal entries — [Qoyod: Idaratech](https://www.qoyod.com/en/marketplace/hr-payroll/idaratech/)

### Inferences
Prioritized adopt-and-exploit list for Shuoon:
1. **Compliance as the main product, not an add-on**: per-employee GOSI cohort logic (before or after 3 July 2024), Mudad/WPS with validation before submission, EOSB accrual and settlement, a live Nitaqat/Saudization dashboard per branch and entity, and Iqama/Muqeem expiry alerts. Publish proof of these integrations (screenshots, certification letters, if available) to counter "partial support" doubts.
2. **Hosting inside the Kingdom plus a PDPL trust page**, published from day one; Zoho has had local hosting since 2024.
3. **Arabic-first, bilingual everything**: UI, payslips, letters and contracts, Hijri and Gregorian dates, right-to-left mobile layout.
4. **A frontline mobile app with Deputy/Connecteam-level UX**: branch geofences, selfie or face liveness checks, a kiosk tablet mode for staff without phones, open shifts, two-way swaps, replacements, rules-based auto-approval, real-time late and missed-punch alerts, shift checklists and tasks, and chat with announcements. WhatsApp notifications cover reach.
5. **Labour-cost intelligence for multi-branch owners**: demand-based schedules from POS data (for example Foodics), labour cost as a percentage of sales per branch, overtime forecasts, and a payroll cost preview while scheduling.
6. **Packaging**: a free tier for 10 or fewer users, plus a choice between per-branch pricing with unlimited staff and per-employee SAR pricing. Benchmark Zoho's SAR 7–15 per employee at entry level, and gate advanced workforce features (auto-scheduling, face kiosk, multi-geofence) in higher tiers, as all the benchmarks do.
7. **AI with guardrails**: pre-run payroll anomaly detection, an Arabic HR and policy assistant, natural-language scheduling, extraction of Saudi documents (a white space), agents scoped to RBAC with human approval, and an API or MCP endpoint.
8. **The enterprise baseline**: SAML/SCIM, branch- and entity-scoped RBAC, audit logs, API and webhooks, ISO 27001 then SOC 2.
9. **Accounting neutrality**: Qoyod marketplace listing first, then Daftra, Odoo and Zoho Books connectors, all using auto-posted journal entries on payroll approval.
10. **Coexistence with global platforms**: position Shuoon as the Saudi local payroll and frontline engine that can feed Deel, Rippling or Darwinbox HQ instances for multinational groups.

### Gaps
- No independent, hands-on test of Arabic UX quality across these vendors.
- No Saudi-specific G2/Capterra satisfaction data or KSA market-share figures were collected.
- No confirmed information on which global vendors hold a Saudi commercial registration or local support teams in 2026, apart from Darwinbox's 2023 Riyadh operations and Zoho's local data centres and investment.
- Prices for Zoho and Deel were extracted by search engine because direct fetches were blocked; re-verify before publishing.
