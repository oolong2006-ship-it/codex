# Saudi Government/Compliance Integrations and Multi-Branch SME Buyer Needs (context for "Shuoon")

_Research date: 30 Oct 2026. How to read these notes: this session could not open zatca.gov.sa, mudad.com.sa, muqeem.sa or news.microsoft.com directly, because those hosts are outside its allowed network domains. Claims attributed to those official pages come from search-engine extracts of the pages, not from reading them in full. Most details of how vendors integrate come from vendor or third-party pages, because no government developer documentation was publicly indexed. Tags: **[pre-2024]** = source older than 2024; **[unofficial]** = not confirmed by an official government source; **[vendor]** = a vendor's claim about its own product._

---

## 1. GOSI: is there an official API for private payroll vendors? How do HR systems sync contributions and registrations? How does the 2024 Social Insurance Law change payroll?

### Takeaway
No public GOSI developer API or partner program for HR/payroll vendors was found. The only machine channel GOSI documents is "System-to-System" integration for **large companies**, using digital certificates and e-signatures. HR vendors (ZenHR, Jisr) advertise GOSI sync. Much GOSI data also moves between government systems without the vendor: authenticated Qiwa contracts flow to GOSI, and Mudad reads GOSI records. The July 2024 Social Insurance Law means payroll must handle two Saudi contribution regimes, legacy and new-entrant, with the new-entrant rate stepping up every July until 2028.

### Cited Findings
**Integration channels**
- GOSI's e-services channels include a "System-to-System" channel aimed at large companies. It runs e-transactions directly between the company's systems and GOSI's systems without human intervention, secured with digital certificates and electronic signatures. The other channels listed are online services, e-payment, GOSI-Phone, a "direct link service" and SMS — [GOSI e-services channels](https://www.gosi.gov.sa/GOSIOnline/E-Services_Channels?locale=en_US); [About GOSI Electronic Services](https://www.gosi.gov.sa/GOSIOnline/About_GOSI_Electronic_Services?locale=en_US)
- GOSI Online offers instant services such as linking Saudi contributors to the establishment's branches registered with MHRSD, and checking a contributor's status — [GOSI Online (search extract)](https://www.gosi.gov.sa/GOSIOnline/Registration)
- ZenHR advertises a native GOSI integration that lets HR add and terminate contributors, update salaries and generate contributor lists inside ZenHR — [ZenHR marketplace: GOSI](https://www.zenhr.com/en/marketplace-integration/general-organization-for-social-insurance-gosi) **[vendor]**
- Jisr says its payroll connects with GOSI, Mudad and banks. It claims to be the only Saudi HR system that cross-checks employee data against GOSI and can update GOSI details in the employee's insurance profile — [Jisr: Run payroll](https://www.jisr.net/en/run-payroll) **[vendor]**
- A competitor-published comparison says Jisr has native integration with Mudad, GOSI, Muqeem and Saned — [Zimyo comparison 2026](https://www.zimyo.me/insights/top-payroll-software-in-saudi-arabia/) **[unofficial; competitor-published]**
- Odoo and Business Central localization vendors add GOSI rate calculation and WPS files. One says its GOSI connectors are "built case by case" and that it exposes payroll data through the ERP's own API rather than any GOSI API — [ECOSIRE Odoo KSA payroll](https://ecosire.com/ar/apps/odoo/odoo-ksa-payroll-gosi-mudad); [ECOSIRE BC KSA payroll](https://ecosire.com/es/apps/dynamics-365-business-central/bc-ksa-hr-payroll-gosi-wps) **[vendor]**
- A commercial guide says that once a contract is documented in Qiwa, its data is sent to GOSI, and wages paid through Mudad are checked against the wages registered with GOSI — [Tanfeth GOSI guide](https://tanfeth.sa/%D9%88%D8%B2%D8%A7%D8%B1%D8%A9-%D8%A7%D9%84%D8%AA%D8%A3%D9%85%D9%8A%D9%86%D8%A7%D8%AA-%D8%A7%D9%84%D8%A7%D8%AC%D8%AA%D9%85%D8%A7%D8%B9%D9%8A%D8%A9/) **[unofficial]**
- Third-party guides say Mudad shows employee data pulled automatically from GOSI's database, which the establishment can review and update in Mudad, and that workers not yet registered with GOSI can be added manually — [NobleCore Mudad guide](https://noblecoreksa.com/mudad-platform-guide-saudi/); [Motaded: about Mudad](https://motaded.com.sa/about-Mudad-Platform) **[unofficial]**
- A Saudi integration consultancy says connecting to the government platforms (Qiwa, Mudad, GOSI, ZATCA) needs digital certificates and encryption, and that the entities provide sandboxes for testing before go-live — [Origami: government platform integration](https://origami.sa/blog/saudi-government-platform-integration-qiwa-gosi-mudad-zatca/) **[unofficial]**

**The new Social Insurance Law (effective 3 July 2024)**
- The new law took effect on 3 July 2024 and raised the retirement age to 65 — [DLA Piper (2024)](https://knowledge.dlapiper.com/dlapiperknowledge/globalemploymentlatestdevelopments/2024/new-social-insurance-law-raises-the-retirement-age); [Arabian Business](https://www.arabianbusiness.com/gcc/saudi-arabia/saudi-arabia-announces-new-social-insurance-law-raises-retirement-age-to-65)
- For Saudi nationals first registered with GOSI on or after 3 July 2024, the annuities (pension) rate rises by 0.5 percentage points for employer and employee each year from 3 July 2025, reaching 11% each on 3 July 2028. Saudis registered before that date stay on legacy rates, and expatriate rates do not change — [PaySpace KB](https://support.payspace.com/portal/en/kb/articles/saudi-arabia-gosi-contribution-rate-increase-saudi-nationals-hired-from-3-july-2024) **[vendor; consistent with other sources]**
- The July 2026 step raised the combined GOSI rate for new-system Saudis from 22.5% to 23.5% (annuities 10% each, plus SANED and occupational hazards) — [PaySpace blog (2026)](https://payspace.com/blog/saudi-arabia-gosi-contribution-rates-increase-1-july-2026-new-employee-employer-rates) **[vendor]**
- Legacy Saudi rates: annuities 9% + 9%, SANED (unemployment) 0.75% + 0.75%, and occupational hazards 2% paid by the employer, for a total of 21.5%. Expatriates are covered only for occupational hazards, at 2% paid by the employer. The contributory wage is basic salary plus housing allowance, capped at SAR 45,000 — [GreytHR GOSI guide](https://www.greythr.com/middle-east/blog/GOSI-compliance-in-saudi-arabia/); [Innbuilt](https://innbuilt.com/insights/saudi-arabia/gosi-contributions-saudi-non-saudi-employees); [NobleCore](https://noblecoreksa.com/gosi-contribution-rates-saudi/) **[unofficial, but consistent across sources]**

### Inferences
- In practice, "GOSI integration" for an SME SaaS means four things: (a) a correct rate engine covering legacy Saudis, new-entrant Saudis with the yearly July step to 2028, and expatriates, all within the SAR 45k cap; (b) contributor registration and termination workflows; (c) reconciliation reports that compare payroll with GOSI's contributor and wage records; and (d) where possible, writing changes back to GOSI. Live write-back is something incumbents market but no outsider can verify.
- Government records for contract, insurable wage and wages paid are converging: Qiwa feeds GOSI, Mudad reads GOSI, and Mudad checks WPS payments against GOSI wages. Detecting **mismatches between Qiwa, GOSI and Mudad** is therefore a core payroll-compliance feature, not an extra.
- GOSI lets establishments link Saudi contributors to their "branches" at MHRSD. In government records, a branch is a separate MHRSD establishment file. A branch-first data model should map each Shuoon branch to its MHRSD establishment or unified number, because Saudization (Nitaqat) and WPS compliance are measured per establishment.
- The only documented GOSI machine channel targets large companies. An SME vendor will probably start with reports and guided workflows, and treat direct GOSI connectivity as a later differentiator.

### Gaps
- No official GOSI developer portal, API specification or third-party vendor terms were found. It is unknown whether System-to-System credentials can be delegated to a SaaS vendor acting for an employer.
- Two rate questions remain unresolved against gosi.gov.sa. The SANED rate is mostly reported as 0.75% each side, but some secondary sources say 1% each. One guide surfaced in search gives the new-system annuity rate as 9.5% from July 2026, which conflicts with PaySpace's 10%.
- How Jisr and ZenHR actually implement GOSI sync (System-to-System, portal automation, or through Mudad) is not disclosed.

---

## 2. Mudad / WPS: how do payroll vendors integrate (API or partner program vs. file upload)? What are the compliance thresholds and penalties? What is Mudad's own payroll product?

### Takeaway
Payroll vendors reach Mudad in three ways: (1) a **partner integration** (ZenHR, Jisr, Bayzat, Menaitech, Mercans and Qoyod all advertise one); (2) a **bank channel**, in which the bank sends the WPS file to Mudad (Al Rajhi automatically; ANB through a WPS API with webhooks); or (3) **generating a SIF file for manual upload**, which is common in ERP localizations. Mudad offers its own free basic payroll tier and a low-cost premium tier, linked to GOSI data, so it sets the price floor. Enforcement tightened in August 2025: there are now defined violation types and a timeline of reminders that ends in inspection after 20 days. Establishments that do not comply have their government services suspended.

### Cited Findings
**How vendors integrate**
- A 2026 developer guide says Mudad publishes no public API. Programmatic integration is open to certified technology partners such as ZenHR and Jisr under a partner agreement — [Noqta: Mudad developer guide 2026](https://noqta.tn/blog/mudad-payroll-integration-saudi-wps-developer-guide-2026) **[unofficial; single source]**
- ZenHR advertises a native integration with Mudad's payroll platform. Its announcement dates from Sept 2022 — [ZenHR marketplace: Mudad](https://www.zenhr.com/en/marketplace-integration/mudad); [ZenHR blog (2022)](https://blog.zenhr.com/en/2022/09/08/whats-new-in-zenhr-mudad-payroll-platform-integration) **[vendor; pre-2024]**
- Bayzat advertises a Mudad integration for KSA — [Bayzat: Mudad](https://bayzat.com/ksa/mudad); [Bayzat help: Mudad integration](https://help.bayzat.com/en/articles/11636857-mudad-integration) **[vendor]**
- Menaitech announced that Mudad platform services are integrated for its KSA clients — [Menaitech news](https://menaitech.com/en/news/integration-of-mudad-platform-services-for-menaitech-ksa-clients/) **[vendor]**
- Mercans says it integrates directly with the Mudad payroll platform — [Mercans glossary](https://mercans.com/glossary/mudad-payroll-platform/) **[vendor]**
- Qoyod (accounting) sends salary disbursement orders from its system to Mudad — [Qoyod: Mudad integration](https://www.qoyod.com/en/knowledge-base/integrations/integration-mudad/) **[vendor]**
- Al Rajhi Bank's payroll service sends clients' WPS files to Mudad automatically — [Al Rajhi Bank WPS](https://www.alrajhibank.com.sa/en/Business/Cash-Management/payroll/WPS)
- ANB publishes a WPS API, with webhooks that notify the customer of the WPS file's status — [ANB developer portal: WPS API](https://developer.anb.com.sa/apis/api/WPS)
- Private employers pay wages through licensed banks using standard Salary Information Files (SIF), which are then validated on Mudad — [greytHR WPS/Mudad guide 2026](https://www.greythr.com/middle-east/blog/saudi-arabia-wps-mudad-compliance-guide-2026/) **[unofficial]**
- An Odoo WPS module notes that WPS bank portals have no universal API, so it generates the SIF file for manual upload — [Odoo l10n_sa_wps_payroll](https://apps.odoo.com/apps/modules/18.0/l10n_sa_wps_payroll) **[vendor]**

**Mudad's own payroll product**
- Mudad's payroll management has a free basic package with limited use and a paid premium package that adds monthly payroll, automated bank linking and salary transfers from the platform. The WPS compliance file is separate, free and independent of the payroll packages. Premium is reported at about SAR 460 a year (about SAR 529 with VAT), varying by headcount — [NobleCore Mudad guide](https://noblecoreksa.com/mudad-platform-guide-saudi/); [Tanfeth Mudad guide](https://tanfeth.sa/%D9%85%D8%A7-%D9%87%D9%8A-%D9%85%D9%86%D8%B5%D8%A9-%D9%85%D8%AF%D8%AF%D8%9F-%D8%A7%D9%84%D8%AF%D9%84%D9%8A%D9%84-%D8%A7%D9%84%D9%85%D8%B1%D8%AC%D8%B9%D9%8A-%D8%A7%D9%84%D8%B4%D8%A7%D9%85%D9%84/); [ZenHR: Mudad Business guide (2023)](https://blog.zenhr.com/2023/10/03/mudad-ksa-business/) **[unofficial; mudad.com.sa could not be opened to verify; some sources pre-2024]**
- Mudad is linked directly to GOSI and displays employee data from the GOSI database — [Motaded: about Mudad](https://motaded.com.sa/about-Mudad-Platform) **[unofficial]**

**Compliance definition and enforcement (official)**
- MHRSD's Wage Protection Program measures compliance as the share of employees whose wages were transferred through the system, out of all employees the establishment has registered with GOSI. New expatriate workers are excluded for their first 90 days in the Kingdom, as are other cases such as workers on leave abroad. Services are suspended for violating or non-compliant establishments after they are alerted and the file deadline passes. Establishments can see rejected records by month and violation type, and their compliance status for the current month and the previous six — [HRSD: Wage Protection initiative (AR)](https://www.hrsd.gov.sa/ar/knowledge-centre/initiatives/national-transformation-initiatives-bank/108808)
- Commercial service offices say a compliance rate below **80%** triggers a WPS flag, which is cleared by uploading the missing files to get above 80%. They also say two consecutive months of delay can lead to immediate service suspension — [Holool: WPS violations](https://holool2030.com/?p=5950); [Motaded: removing the WPS flag](https://motaded.com.sa/ar/blog/%D8%A5%D8%B2%D8%A7%D9%84%D8%A9-%D9%85%D9%84%D8%A7%D8%AD%D8%B8%D8%A9-%D8%AD%D9%85%D8%A7%D9%8A%D8%A9-%D8%A7%D9%84%D8%A3%D8%AC%D9%88%D8%B1) **[unofficial; neither figure appears in the official text found]**

**August 2025 tightening**
- MHRSD's updated WPS rules treat these as violations: unreasonable basic wages (too high or too low), deductions above 50% of pay, a basic wage not recorded in the system for more than 90 days, failing to enter the basic wage in the designated fields, non-payment, and having no record of wage disbursement — [Gulf News (Aug 2025)](https://gulfnews.com/world/gulf/saudi/saudi-arabia-flags-unreasonable-wages-and-delayed-payments-as-payroll-violations-1.500233626); [GPA](https://gpa.net/blogs/middle-east/saudi-arabia-unreasonable-wages-and-delays-will-trigger-violations-under-mudad-system); [DLA Piper (2025)](https://knowledge.dlapiper.com/dlapiperknowledge/globalemploymentlatestdevelopments/2025/new-wage-monitoring-system-to-crack-down-on-salary-violations); [People Matters ME](https://me.peoplemattersglobal.com/news/compensation-benefits/saudi-hr-ministry-makes-wage-protection-stricter-to-track-down-all-unreasonable-transfers-46501)
- Timeline: a reminder when wages fall due, a second notice at day 10, a final warning at day 15, and an inspection if files are still missing at day 20. The employer has 10 days to explain a delay; the employee then has 3 days to accept or reject the explanation, after which it is auto-accepted — [Gulf News (Aug 2025)](https://gulfnews.com/world/gulf/saudi/saudi-arabia-flags-unreasonable-wages-and-delayed-payments-as-payroll-violations-1.500233626); [GPA](https://gpa.net/blogs/middle-east/saudi-arabia-unreasonable-wages-and-delays-will-trigger-violations-under-mudad-system)

**Fines** (dates uncertain; verify against the current MHRSD violations schedule)
- Fragomen reports the fine for failing to upload the monthly WPS file as **SAR 500–2,000** depending on company size, down from SAR 5,000–15,000. It reports revised size bands of Category C ≤20 workers, B 21–49 and A ≥50 — [Fragomen](https://www.fragomen.com/insights/saudi-arabia-fines-for-labor-violations-significantly-reduced.html) **[appears to describe the 2023 revision; pre-2024]**
- Delayed payment of wages and allowances is fined **SAR 300 per worker** regardless of size. The earlier fines were about SAR 5,000, 3,000 or 2,000 depending on size — [Gulf News](https://gulfnews.com/world/gulf/saudi/saudi-arabia-slashes-fines-for-labour-law-violations-by-up-to-94-1.99880589); [Saudi Gazette](https://saudigazette.com.sa/article/638558/SAUDI-ARABIA/Up-to-94-cut-in-penalties-for-Labor-Law-violations) **[pre-2024]**
- A later report says the new violations schedule largely keeps the fines introduced in 2024, with some exceptions — [MRRORS](https://www.mrrors.org/article/saudi-arabia-revises-its-schedule-of-violations-and-penalties-for-work-violations/) **[unofficial]**

### Inferences
- **Table stakes:** generating Mudad-compatible WPS/SIF files and bank files; a pre-submission validator that catches the August 2025 violation types (basic wage missing or "unreasonable", deductions over 50%, late files); and a per-establishment compliance dashboard covering the 80% threshold (unofficial), the day-10/15/20 timeline and new-expat exclusions.
- **Differentiator:** direct, partner-certified submission to Mudad and bank APIs (ANB-style webhooks) instead of manual upload. Only a handful of incumbents advertise this, and it appears to need a partner agreement.
- Fines are now modest (SAR 500–2,000 per WPS file; SAR 300 per worker for late wages), so the bigger commercial pain is **suspended services**: no visas, renewals or transfers. Sell on "never get your services stopped", not on avoiding fines.
- Mudad's free and roughly SAR 460/year tiers mean a branch-first product cannot win on WPS alone. It must bundle attendance, branch costing and iqama workflows.

### Gaps
- mudad.com.sa could not be opened, so official Mudad partner or API terms, partner criteria and current premium pricing were not verified.
- No official source confirms the 80% compliance threshold or the two-month suspension rule.
- No complete 2025–2026 MHRSD fine table by establishment size was found.

---

## 3. Qiwa: contract authentication, employee transfer and Nitaqat. Is there a partner program or API for HR vendors?

### Takeaway
Qiwa is now the system of record for employment. Since 15 April 2026, Saudization (Nitaqat) counts only Saudis whose contracts are documented in Qiwa. No public Qiwa developer portal was found. The most important 2026 development is that **Takamol, the government company behind Qiwa, launched "Tazamon" at LEAP 2026**: a product that lets companies **and HR service providers** connect their internal systems to labor-market platforms and automate contract processes. This looks like the emerging official route for HR vendors, but its terms are not public.

### Cited Findings
- Electronic employment contracts have had to be generated through Qiwa since a May 2022 MHRSD mandate — [Clyde & Co (2023)](https://www.clydeco.com/en/insights/2023/05/electronic-employment-contracts-through-qiwa) **[pre-2024]**. MHRSD said more than 9 million contracts had been documented — [Argaam](https://www.argaam.com/en/article/articledetail/id/1608200); [HRSD news](https://www.hrsd.gov.sa/en/media-center/news/240720241)
- In Q1 2026 Qiwa passed 2 million registered establishments, 13 million registered workers and 12 million documented employment contracts — [SPA (official)](https://spa.gov.sa/en/N2574089)
- MHRSD announced that from **15 April 2026** Saudization rates are calculated from employment contracts documented electronically on Qiwa — [HRSD news (fragment)](https://www.hrsd.gov.sa/en/media-center/news/توثيق-عقود-العمل-إلكترونياً). Saudis whose contracts are not documented in Qiwa can no longer be counted, and the documentation targets are **85% by 30 April 2026 and 90% by 30 June 2026** — [EIG Law](https://eiglaw.com/?p=14511); [Envoy Global](https://www.envoyglobal.com/news-alert/the-kingdom-of-saudi-arabia-updates-saudization-calculation-rules-and-qiwa-documentation-targets/)
- One vendor says non-Saudis without authenticated contracts also stop being counted. Other sources mention only Saudis, so this is probably an error — [Jobbatical](https://www.jobbatical.com/blog/saudi-arabia-qiwa-electronic-contracts-nitaqat-compliance) **[unofficial; conflicting]**
- **Tazamon (LEAP 2026):** Takamol launched "Tazamon" so that establishments and HR service providers can automate organizational and contractual procedures by linking their internal systems to labor-market platforms. The internal system stays the control center while procedures run automatically. Scope covers the establishment lifecycle and contracts, from readiness checks to issuing work permits and renewing obligations — [Makkah Newspaper (AR)](https://makkahnewspaper.com/article/1634854/%D8%A3%D8%B9%D9%85%D8%A7%D9%84/%D8%AA%D9%83%D8%A7%D9%85%D9%84-%D8%AA%D8%B7%D9%84%D9%82-%D9%85%D9%86%D8%AA%D8%AC-%D8%AA%D8%B2%D8%A7%D9%85%D9%86-%D9%84%D8%B1%D8%A8%D8%B7-%D8%A3%D9%86%D8%B8%D9%85%D8%A9-%D8%A7%D9%84%D9%85%D9%86%D8%B4%D8%A2%D8%AA-%D8%A8%D9%85%D9%86%D8%B5%D8%A7%D8%AA-%D8%B3%D9%88%D9%82-%D8%A7%D9%84%D8%B9%D9%85%D9%84). Takamol signed 34 agreements at LEAP 2026 — [Maaal](https://maaal.com/en/news/details/takamol-holding-concludes/)
- Takamol's CEO said about 1 million operations a day are tracked on Qiwa, which supports Takamol's role as operator — [Asharq Al-Awsat](https://english.aawsat.com/business/5026747-%E2%80%98takamol%E2%80%99-ceo-1-mln-daily-operations-tracked-%E2%80%98qiwa%E2%80%99-platform)
- A 2026 developer blog describes Qiwa REST APIs. It lists as prerequisites a commercial registration linked to Qiwa, a digital certificate from Takamol, an authorized delegate in Qiwa Business and a sandbox, and mentions OAuth 2.0 client credentials. It claims SAP SuccessFactors, Oracle HCM, Zoho People, PalmHR and DocSuite have pre-built Qiwa connectors — [Noqta: Qiwa integration 2026](https://noqta.tn/en/blog/qiwa-integration-hr-systems-saudi-nitaqat-2026) **[unofficial; single source; unverified]**
- An ERPNext connector says it authenticates to the Qiwa and Muqeem endpoints "or an authorised intermediary, depending on your access agreement", and that the customer must provide government portal access — [ECOSIRE ERPNext Qiwa/Muqeem sync](https://ecosire.com/apps/erpnext/erpnext-ksa-qiwa-muqeem-sync) **[vendor]**
- **Ajeer** (run by MHRSD) lets one business use another's workers temporarily without transferring sponsorship, including through an Ajeer Contracting Permit, which matters for contracting firms — [Saudipedia: Ajeer](https://saudipedia.com/en/what-is-ajeer-platform)
- Employee transfers: a 2026 KPMG alert warns that a prospective employer may face costs if outstanding work-permit fees have to be paid during a Qiwa transfer — [KPMG GMS flash alert 2026-256](https://kpmg.com/xx/en/our-insights/gms-flash-alert/2026/flash-alert-2026-256.html)
- Pre-2024 fine levels for Saudization violations: missing Saudization ratios SAR 2,000–6,000 by size — [Fragomen](https://www.fragomen.com/insights/saudi-arabia-fines-for-labor-violations-significantly-reduced.html); falsely registering a Saudi worker SAR 2,000–8,000 — [Gulf News](https://gulfnews.com/world/gulf/saudi/saudi-arabia-slashes-fines-for-labour-law-violations-by-up-to-94-1.99880589) **[pre-2024]**

### Inferences
- **Table stakes for 2026:** mirror each employee's Qiwa contract status (draft, sent, authenticated, rejected) and wage terms, and give a per-establishment Nitaqat simulator that counts only Qiwa-authenticated Saudi contracts. Since April 2026, a Saudi hire whose contract is not authenticated is invisible to Nitaqat, which directly hurts a branch's visa and renewal capacity.
- **Differentiator:** writing to Qiwa (creating and sending contracts, starting transfers, Ajeer requests) through an official channel. Tazamon appears to be the sanctioned route for "HR service providers". An early integration partnership with Takamol could be a strong moat for a newcomer, but terms, pricing and eligibility are unknown.
- Multi-branch SMEs often run several MHRSD establishment files under one owner, so a branch-first product should show Nitaqat band, documentation rate and WPS compliance **per establishment file**, rolled up to the group.

### Gaps
- No official Qiwa or Takamol developer portal, API documentation, partner criteria or Tazamon pricing was found.
- Not officially confirmed: a reported new Nitaqat phase for 2026–2028 with sector thresholds, and a vendor claim that Saudis earning under SAR 3,000 are excluded from the count.

---

## 4. Muqeem (iqama, exit/re-entry) and Absher Business: what integration options do vendors have?

### Takeaway
Muqeem, run by Elm for Jawazat, has **no self-service public API**. Programmatic access goes through Elm's official integration channel, a paid add-on to a full Muqeem subscription; Bayzat reports it costs 12–20% of the subscription. A few vendors (Bayzat, SAP partner SNAM, Odoo and ERPNext modules) offer Muqeem transactions or expiry tracking. **No vendor API for Absher Business was found.** It charges per-transaction value-added fees, so most HR products only track expiries and hand off to Absher or Muqeem.

### Cited Findings
- Muqeem has no self-service API. Access runs through Elm's official integration channels (reportedly the "Rabet" platform or equivalent) and requires a comprehensive-type establishment subscription with integration permission enabled — [Noqta: Muqeem integration 2026](https://noqta.tn/en/blog/muqeem-integration-iqama-exit-reentry-saudi-2026) **[unofficial]**
- Muqeem API integration has its own subscription, separate from the standard Muqeem packages — [Motaded: Muqeem](https://motaded.com.sa/index.php/platforms/muqeem) **[unofficial]**
- Bayzat says Muqeem charges 12–20% of the pro-rated subscription cost to enable API use. Bayzat lets customers start Muqeem transactions such as iqama and exit/re-entry from its web and mobile portals — [Bayzat help: Muqeem integration](https://help.bayzat.com/en/articles/11636858-muqeem-integration) **[vendor]**
- An Odoo module connects to Muqeem for visa issuance, iqama renewal and cancellation, priced at about USD 2,917 for v15 — [Odoo aps_muqeem_integration](https://apps.odoo.com/apps/modules/15.0/aps_muqeem_integration) **[vendor]**
- SAP lists a Saudi partner add-on (SNAM "Yaqeen") for SuccessFactors that supports issuing iqamas through Muqeem — [SAP partner page](https://www.sap.com/products/hcm/partners/smart-national-solutions-for-information-snam-yaqeen.html) **[vendor]**
- An ERPNext app tracks iqama expiry with reminders at 90, 60, 30 and 7 days — [ECOSIRE ERPNext Qiwa/Muqeem sync](https://ecosire.com/apps/erpnext/erpnext-ksa-qiwa-muqeem-sync) **[vendor]**
- Absher Business value-added fees from January 2025, charged on top of the employer's annual package: SAR 103.50 for an exit/re-entry extension, SAR 51.75 for iqama renewal, SAR 70 for final exit and SAR 28.75 for an employee report — [KSA Expats](https://ksaexpats.com/new-absher-fees-iqama-visa-2025/); [Guide to KSA](https://guidetoksa.com/absher-business-iqama-renewal-fees/) **[unofficial]**
- Expatriate labor costs reported for 2026: a monthly levy of SAR 700 per expat worker where expats do not outnumber Saudis, SAR 800 where they do; a SAR 400 monthly dependent levy; and a SAR 100 annual work-permit fee — [Etqan Law Firm](https://etqanlawfirm-sa.com/en/labour-iqama-fees-in-saudi-arabia/); [Saudi Life Guide](https://saudilifeguide.com/saudi-arabia-iqama-fees/) **[unofficial; verify on Qiwa or Absher]**

### Inferences
- **Table stakes:** an expiry engine for iqama, passport, exit/re-entry, work permit and other sector documents, with staged reminders, per-branch views, and costing of renewal fees and levies.
- **Differentiator:** Muqeem transactions inside the HR app through Elm's paid integration, such as issuing exit/re-entry when leave is approved. It adds cost (12–20% of the customer's Muqeem subscription) and needs an Elm agreement, so a newcomer might start with guided deep links and data sync and add the Elm API later for larger customers.
- With the expat levy at SAR 700–800 per month plus GOSI and renewal fees, "true labor cost per branch" should include government fees, not just salary.

### Gaps
- Official Muqeem and Elm integration terms, prices and partner eligibility could not be verified (muqeem.sa could not be opened).
- No Absher Business API or partner program was found.
- Current Muqeem subscription package prices were not found.

---

## 5. ZATCA e-invoicing: relevance for a SaaS vendor billing its customers (Phase 2 waves) and for HR products (expense invoices)

### Takeaway
Phase 2 (integration) now reaches very small taxpayers. **Wave 25 covers VAT-taxable revenue above SAR 187,500 and must integrate with FATOORA by 1 February 2027.** Shuoon's own billing therefore has to be Phase-2 compliant from early revenue, and its B2B customers will expect compliant tax invoices. For the HR product itself, ZATCA matters mainly for expense claims built from supplier e-invoices, which is a potential differentiator rather than a requirement.

### Cited Findings
- **Wave 25**, announced 24 July 2026, covers taxpayers whose VAT-taxable revenue exceeded **SAR 187,500** in any year from 2022 to 2025. They must integrate by **1 February 2027**. ZATCA will notify later waves at least six months before their integration date — [ZATCA: Wave 25 (search extract)](https://zatca.gov.sa/en/MediaCenter/News/Pages/Wave25-E-invoicing.aspx); [KPMG (Jul 2026)](https://kpmg.com/us/en/taxnewsflash/news/2026/07/saudi-arabia-e-invoicing-mandatory-for-taxpayers-with-revenue-above-sar-187500.html); [VATupdate](https://www.vatupdate.com/2026/07/27/zatca-announces-wave-25-of-e-invoicing-threshold-halved-to-sar-187500-integration-deadline-1-february-2027/)
- **Wave 24** covers revenue above **SAR 375,000** (2022–2024), due by 30 June 2026 — [KPMG (Oct 2025)](https://kpmg.com/us/en/taxnewsflash/news/2025/10/saudi-arabia-mandatory-e-invoicing-24th-group-taxpayers.html); [Comarch](https://www.comarch.com/trade-and-services/data-management/legal-regulation-changes/saudi-arabia-announces-24th-wave-for-phase-2-e-invoicing-integration/). Grant Thornton gives a start date of 1 April 2026 instead — [Grant Thornton](https://www.grantthornton.sa/insights/articles-and-publications/wave_24_implementation_of_e_invoicing_in_saudi_arabia/) **[conflict]**
- **Wave 23** covers revenue above **SAR 750,000** (2022–2024), mandatory from 31 March 2026 — [Qoyod: Phase 2 waves](https://www.qoyod.com/en/knowledge-base/e-invoicing/e-invoicing-phase-2-waves/) **[unofficial]**

### Inferences
- **For Shuoon as a seller:** once VAT-registered and above SAR 187.5k revenue, it falls into Wave 25 or a later wave. Its billing stack (Stripe, Chargebee, Zoho Billing or a local provider) must produce Phase-2 cleared or reported invoices through FATOORA. Using a ZATCA-integrated billing provider from day one avoids rework.
- **For the HR product:** ZATCA is not a table-stakes HR integration. Reading the QR code and VAT number on employees' receipts in expense claims, and checking supplier VAT details, could be a modest differentiator, especially if paired with an accounting integration such as Qoyod (see section 8).
- B2B buyers' finance teams increasingly receive only e-invoices, so a SaaS vendor's non-compliant invoices could create procurement friction. This is an inference; no buyer survey was found.

### Gaps
- zatca.gov.sa could not be opened, so the Wave 25 notice's exact wording was taken from search extracts and secondary sources.
- A reported enforcement regime (fines of SAR 5,000–50,000 from July 2026) could not be traced to an official source.
- No source was found on Saudi HR buyers' demand for e-invoice capture in expense management.

---

## 6. PDPL and data residency: SDAIA requirements, NCA cloud controls (CCC), in-Kingdom hosting demands from government and large buyers, and which cloud regions exist in KSA

### Takeaway
Today the PDPL, enforceable since September 2024, has **no general data-localization rule**. Transfers abroad are allowed under SDAIA's amended Transfer Regulation, in force since 1 September 2024. However, **SDAIA's draft amendments published 6 October 2026 (comments close 5 November 2026) would add an express duty to store personal data inside the Kingdom** (draft Art. 23(2)), plus registration for controllers that transfer data abroad and 72-hour breach notification with no harm threshold. Government and semi-government buyers already require in-Kingdom hosting under the Cloud First policy, NDMO data classification and NCA controls. In-Kingdom hyperscale options are expanding fast: Google (Dammam), Oracle (Jeddah, Riyadh), Huawei and Alibaba/SCCC (Riyadh) are live, Azure Saudi Arabia East is due in November 2026 and AWS in December 2026.

### Cited Findings
**PDPL and SDAIA**
- The PDPL became enforceable in September 2024 — [Clyde & Co (Sep 2024)](https://www.clydeco.com/en/insights/2024/09/saudi-arabia-s-personal-data-protection-law-become)
- SDAIA's amended Regulation on Personal Data Transfer outside the Kingdom took effect on **1 September 2024**, after a consultation from March to 18 April 2024. A risk assessment is still required in some cases, such as relying on appropriate safeguards or continuous or large-scale transfers of sensitive data — [Digital Policy Alert](https://digitalpolicyalert.org/event/22351-implemented-regulation-on-personal-data-transfer-outside-the-kingdom); [Clyde & Co (Feb 2025)](https://www.clydeco.com/en/insights/2025/02/10-legal-updates-ksa-tech-and-data-laws)
- **Draft amendments (6 Oct 2026; consultation until 5 Nov 2026):**
  - a new Art. 23(2) expressly requiring controllers to store personal data within the Kingdom (possibly meaning a copy must stay in KSA while transfers remain allowed);
  - mandatory registration for controllers that transfer data abroad;
  - 72-hour breach notification without a harm threshold;
  - DPO details to be filed on SDAIA's platform, with the standalone DPO rules folded into the Regulations;
  - a 20-business-day deadline to answer SDAIA requests;
  - entry into force 60 days after publication in the Official Gazette.
  - Sources: [Clyde & Co (Oct 2026)](https://www.clydeco.com/en/insights/2026/10/sdaia-publishes-draft-amendments-to-the-pdpl); [Reed Smith](https://www.reedsmith.com/our-insights/blogs/viewpoints/102o5at/sdaia-consults-on-extensive-amendments-to-the-saudi-pdpl-implementing-regulation/); [Bird & Bird (2026)](https://www.twobirds.com/en/insights/2026/japan/saudi-arabia-sdaia-returns-with-a-revised-draft-of-changes-to-the-data-protection-regulations); [Aziz ME](https://azizme.com/en/blog/saudi-pdpl-draft-store-data-in-kingdom)
- Law-firm commentary says that, outside certain sectoral regimes, the PDPL currently imposes no general localization requirement — [Clyde & Co (Oct 2026)](https://www.clydeco.com/en/insights/2026/10/sdaia-publishes-draft-amendments-to-the-pdpl); [Bird & Bird (2026)](https://www.twobirds.com/en/insights/2026/japan/saudi-arabia-sdaia-returns-with-a-revised-draft-of-changes-to-the-data-protection-regulations)
- An earlier draft round ran in 2025 — [Dentons (May 2025)](https://www.dentons.com/en/insights/alerts/2025/may/5/proposed-amendments-to-the-ksas-implementing-regulations-of-the-personal-data-protection-law); [Bird & Bird (2025)](https://www.twobirds.com/en/insights/2025/saudi-arabia-public-consultation-on-draft-changes-to-the-data-protection-regulations)

**Government, semi-government and large buyers**
- MCIT's Cloud First Policy says all data in the Government Cloud and the Commercial Governmental Cloud should be located inside KSA, and data classified Top Secret or Secret must be hosted in the Government Cloud — [MCIT Cloud First Policy PDF](https://mcit.gov.sa/sites/default/files/cloud_policy_en.pdf) **[pre-2024, about 2020; check for updates]**
- NDMO's data management and personal data policies define a four-level classification scheme — [NDMO policies PDF](https://sdaia.gov.sa/ndmo/Files/PoliciesEn001.pdf) **[pre-2024]**
- NCA's Cloud Cybersecurity Controls (CCC) apply to government organizations, their companies, and cloud service providers serving them — [NCA CCC PDF](https://nca.gov.sa/ccc-en.pdf). One security firm says the strict in-Kingdom storage, processing and DR requirement was removed from CCC-2:2024 and is now governed by NDMO data rules — [SecurityWall](https://securitywall.co/blog/ccc-cloud-cybersecurity-controls-saudi-arabia) **[unofficial]**. Vendor blogs still describe in-Kingdom residency as required for sensitive government workloads — [MomentumX](https://momentumx.cloud/nca-ccc2-cloud-ksa/) **[conflict; vendor]**
- Competitor signal: Zoho markets "hosted in Saudi Arabia" and announced its Saudi operations secured "Class-B" status under NCA's framework — [Zoho: hosted in Saudi Arabia](https://www.zoho.com/en-sa/hosted-in-saudi-arabia.html); [Zoho blog: NCA compliance](https://www.zoho.com/blog/en-mea/general/zoho-ksa-nca-compliance.html); [Zoho blog: data localisation](https://www.zoho.com/blog/general/saudi-data-localisation-compliance-ready-clouds.html) **[vendor]**
- Capterra's global 2025 research found 67% of HR software researchers consider security a critical feature. This is not Saudi-specific — [Capterra HR tech trends 2025](https://www.capterra.com/resources/hr-technology-trends/)

**Cloud regions in KSA (status as of Oct 2026)**
- **Google Cloud, Dammam:** live since November 2023, delivered through CNTXT. One guide says it is limited to Saudi-based customers.
- **Oracle:** Jeddah live since 2020 (sources say February or July 2020); Riyadh live since August 2024; a NEOM region planned.
- **Huawei Cloud, Riyadh:** live since September 2023, with three availability zones.
- **Alibaba Cloud, Riyadh:** live since June 2022 through the SCCC joint venture with STC.
- **Tencent Cloud, Riyadh:** reportedly launched in 2025 (disputed).
- Sources for the five items above: [Smartwayt 2026](https://smartwayt.com/cloud-regions-in-saudi-arabia/); [Alskyline 2026 guide](https://alskyline.com/kb/cloud-regions-saudi-arabia-2026-guide); [Vision2030.ai](https://vision2030.ai/sectors/technology/saudi-arabia-cloud-regions/); [RIV-ERP: Oracle Jeddah/Riyadh](https://riv-erp.com/en/oracle-cloud-saudi-arabia-data-residency-erp/) **[secondary; provider pages not fetched]**
- **AWS:** the Saudi region is due **December 2026** with three AZs, part of an investment of more than USD 5.3B first announced in March 2024 — [W.Media](https://w.media/aws-saudi-arabia-cloud-region-set-for-december-2026-launch/); [Channel Insider](https://www.channelinsider.com/infrastructure/news-aws-cloud-region-launch-emea-saudi-arabia/); [Data Centre Magazine](https://datacentremagazine.com/articles/aws-invests-5.3bn-in-saudi-arabia-launches-cloud-region)
- **Microsoft Azure, "Saudi Arabia East" (Eastern Province, three AZs):** in February 2026 Microsoft confirmed customers could run workloads from Q4 2026. A later update says **November 2026**. Microsoft says government and private organizations can host eligible workloads locally for data residency — [Microsoft Source EMEA (Feb 2026; search extract)](https://news.microsoft.com/source/emea/2026/02/microsoft-confirms-saudi-arabia-datacenter-region-available-for-customers-to-run-cloud-workloads-from-q4-2026/); [Asharq Al-Awsat](https://english.aawsat.com/technology/5313290-microsoft-make-its-saudi-arabia-datacenter-region-available-november); [W.Media](https://w.media/microsofts-saudi-arabia-east-data-center-region-to-be-available-in-november-2026/). A claim that Azure had two Saudi regions in 2022 is contradicted by Microsoft's own 2026 announcement.

### Inferences
- **Today:** in-Kingdom hosting is **table stakes** for government, semi-government and regulated or large buyers, and a **differentiator** for private SMEs (restaurants, retail, contracting), who rarely ask for it. Clinics hold health data, which PDPL treats as sensitive, so they sit closer to the "ask for it" end.
- **If the draft Art. 23(2) is adopted (possibly in 2027):** keeping a copy of personal data in KSA could become a baseline for all controllers, and HR SaaS vendors would face it through their customers' contracts. A newcomer should design for in-Kingdom primary storage from day one. With AWS (Dec 2026) and Azure (Nov 2026) arriving alongside Google Dammam and Oracle Riyadh/Jeddah, this no longer forces a niche cloud.
- **Certifications:** NCA CCC compliance is the recognized signal for public-sector and large deals (Zoho markets its "Class-B" status), along with a PDPL program: DPO, records of processing, SDAIA registration where required, and a 72-hour breach process. ISO 27001 and SOC 2 are generic trust signals. No Saudi source specifically ranked them for SME buyers.

### Gaps
- Official SDAIA, NDMO and CST texts on current localization rules for private-sector data could not be fetched. The CST cloud regulatory framework's obligations for SaaS providers (registration, classes) were not verified.
- No survey quantifies how often private SME buyers demand in-Kingdom hosting.
- Provider pages confirming exact region launch dates (Google, Oracle, Huawei, Alibaba, Tencent) were not fetched.

---

## 7. What do multi-branch SMEs in restaurants, retail, contracting, clinics and logistics prioritize? Any surveys or market reports?

### Takeaway
No Saudi-specific buyer survey ranks HR-software features: attendance fraud, mobile quality, Arabic, price or local support. The evidence base is regulatory pressure plus sector studies. Buyer priorities are driven by: (1) **compliance that gates operations**, since WPS lapses or Nitaqat shortfalls suspend services, and Nitaqat now counts only Qiwa-documented contracts; (2) **sector-specific Saudization quotas** for pharmacies, dental, sales and marketing; (3) **high turnover and 24/7 shift operations** in restaurants and retail; (4) **expat document and cost management**; and (5) **sector licensing**: Balady health certificates for food staff, SCFHS licenses for clinicians, TGA courier rules with face verification for logistics, and Ajeer for contracting. Market-size estimates for Saudi HR tech vary roughly two-fold, from about USD 0.58B to 1.2B as of 2023/24.

### Cited Findings
**Market size and adoption**
- Saudi HR tech was estimated at **USD 576.8M in 2024**, growing at a 10.7% CAGR to about USD 1B by 2031–2033 — [Okaz](https://www.okaz.com.sa/economy/saudi/2226523); [Taiwan News / Reportocean release](https://www.taiwannews.com.tw/en/news/6047216). Astute Analytica gives a much higher **~USD 1.23B for 2023**, rising to USD 2.68B by 2032 at a 9.25% CAGR — [Astute Analytica](https://www.astuteanalytica.com/request-sample/saudi-arabia-hr-tech-software-market). IMARC gives an 8.6% CAGR for 2024–2032 — [IMARC](https://imarcgroup.com/saudi-arabia-hr-tech-market) **[paywalled; inconsistent]**
- Saudi Arabia had about **1.7 million active commercial registrations** (SMEs) at the end of Q2 2025, per Monsha'at's SME Monitor — [Zawya](https://www.zawya.com/en/economy/gcc/monshaat-report-saudi-commercial-registrations-hit-17mln-hxxoyd1b); [Sharikat Mubasher](https://sharikatmubasher.com/media-hub/news/21508629/active-commercial-registrations-in-saudi-arabia-reach-17-mn-in-q2-25?lang=en)
- Qiwa had more than 2 million registered establishments in Q1 2026 — [SPA](https://spa.gov.sa/en/N2574089)
- Jisr, the local market leader, raised a USD 30M Series A in October 2023 led by Merak Capital, reported as the region's largest SaaS Series A, with 3,000+ clients and 350k+ employees at the time — [Wamda (2023)](https://wamda.com/2023/10/saudi-jisr-closes-30-million-series-merak-capital) **[pre-2024]**. Jisr's site now claims 1M+ employees on the platform — [Jisr: about](https://jisr.net/en/about) **[vendor]**

**Restaurants and retail: Saudization, turnover, shifts**
- A peer-reviewed restaurant-sector study found that managers say small and mid-sized restaurants offer limited career progression, making Saudization quotas hard to meet. The work environment predicted Saudi workers' turnover intention, and 24/7 opening hours were a barrier — [Sustainability (2023)](https://doi.org/10.3390/su15097654) **[pre-2024]**
- An October 2025 policy report on retail and restaurant chains lists Saudization among the main challenges and has a section on HR and licensing; its figures could not be extracted — [Mukatafa (Oct 2025)](https://mukatafa.org/wp-content/uploads/2025/10/The-Saudi-Chain-Of-Public-Policy-Challenge_Eng.pdf)
- A recruiter claims 52% of fashion retailers report high turnover among Saudi staff and 62% of grocery retailers struggle to staff overnight shifts — [Questsearch (Apr 2025)](https://www.questsearch.co.uk/2025/04/the-role-of-saudization-in-reshaping-retail-hiring-practices-in-saudi-arabia/) **[unofficial; no traceable primary survey]**
- Food and public-health workers (restaurants, cafés, bakeries) need a Balady health certificate based on a medical exam at an MoH-approved center; issuance takes 4–10 days — [Balady: issuance of health certificate](https://balady.gov.sa/en/services/issuance-health-certificate); [MOMAH/Balady news](https://balady.gov.sa/en/about-balady/news/ministry-municipalities-and-housing-emphasizes-importance-health-certificates). Employing workers without a valid certificate, or with an expired one, is fined SAR 200–2,000 — [Gulf News](https://gulfnews.com/amp/world/gulf/saudi/restaurant-staff-found-nose-picking-and-spitting-in-saudi-arabia-could-cost-up-to-2000-riyals-1.97834360) **[date unclear]**. One guide says the certificate is valid for one year — [NobleCore](https://noblecoreksa.com/health-certificate-employees-saudi/) **[unofficial]**
- Sales and marketing Saudization of 60% applies from 19 April 2026 to establishments with three or more workers in those roles, and Saudi marketing staff must earn at least SAR 5,500 to count — [Labeeb tracker](https://labeeb.ae/saudization-tracker/); [KSA Expat Guide](https://www.ksaexpatguide.com/saudization-rules-by-profession/) **[unofficial]**

**Clinics**
- January 2025 MHRSD decisions:
  - **Pharmacy:** 35% in community pharmacies and medical complexes, 65% in hospital pharmacies and 55% in other pharmacy activities, for establishments with five or more pharmacy workers.
  - **Dentistry:** 45% rising to 55%, for establishments with three or more dental workers; Saudi dentists must earn at least SAR 9,000 to count. Effective around July 2025.
  - Sources: [SPA (official)](https://www.spa.gov.sa/en/N2250338); [Saudi Gazette](https://saudigazette.com.sa/article/648889/SAUDI-ARABIA/Saudi-Arabia-to-raise-localization-rates-in-269-professions)
- SCFHS professional registration lasts two years and is renewed on Mumaris Plus, subject to continuing medical education (CME). Employers link practitioners to their facility through an institutional Mumaris Plus account — [Neelim](https://neelim.com/blog/scfhs-license-saudi-arabia); [Allocation Assist](https://www.allocationassist.com/medical-licensing-scfhs-in-saudi-arabia/) **[unofficial]**

**Logistics and delivery**
- TGA rules from 2024: non-Saudi couriers may not be self-employed and must move to licensed companies over a 14-month transition; companies must enable driver face verification linked to TGA's system; apps using unlicensed carriers face penalties — [Gulf News](https://gulfnews.com/world/gulf/saudi/saudi-aabia-new-rules-for-delivery-services-sector-take-effect-1.101979587); [Gulf News](https://gulfnews.com/world/gulf/saudi/self-employment-banned-for-non-saudis-in-delivery-services-1.100627812); [Enterprise (Jan 2024)](https://enterpriseam.com/ksa/2024/01/24/tga-is-out-with-rules-to-regulate-online-delivery/); [Zawya](https://www.zawya.com/en/world/middle-east/saudi-tga-warns-of-penalizing-delivery-apps-that-ship-their-products-through-unlicensed-carriers-i8eo2zsq). TGA paused new app-based motorcycle delivery licenses in October 2024 — [Argaam](https://www.argaam.com/en/article/articledetail/id/1760983)

**Contracting**
- Ajeer contracting permits let contractors use another establishment's workers temporarily, without transferring sponsorship — [Saudipedia](https://saudipedia.com/en/what-is-ajeer-platform)

**Buying behavior (global, not Saudi)**
- Capterra's 2025 HR tech research (about 3,200 HR buyers in 11 countries; Saudi Arabia not evident in the list): 62% of HR leaders expect payroll costs to rise, and buyers who regret a purchase lean heavily on vendor-provided information — [Capterra HR tech trends 2025](https://www.capterra.com/resources/hr-technology-trends/); [Capterra purchase-regret report](https://www.capterra.com/resources/tech-trends-hr-software-purchase-regret/)

### Inferences
- **Priority stack for multi-branch SMEs**, inferred from regulation and sector evidence:
  1. "Keep my establishments' services running": WPS, Nitaqat and Qiwa documentation status per establishment file.
  2. Labor cost per branch, including GOSI step-ups, the SAR 700–800 expat levy and renewal fees.
  3. Shift scheduling and attendance for 24/7 multi-site operations, plus anti-fraud features such as geofencing and face match. TGA already mandates face verification for couriers, which normalizes the pattern.
  4. Sector document expiry: iqama, Balady health certificates, SCFHS licenses, driver permits.
  5. Turnover-ready onboarding and offboarding: fast Qiwa contract and transfer handling, end-of-service settlement.
- **Sector differentiators:**
  - Restaurants: health-certificate tracking per branch, 24/7 rosters, split shifts.
  - Retail: tracking against the sales/marketing Saudization quota and its wage floor (SAR 5,500 for marketing).
  - Clinics: SCFHS/Mumaris license tracking, and pharmacy/dental quota calculators with wage floors (SAR 9,000 for dental).
  - Logistics: driver document and face-verification compliance, TGA-licensed carrier status.
  - Contracting: site-based attendance, Ajeer worker tracking, large expatriate workforces (Muqeem-heavy).
- Mobile app quality, Arabic-first UX, price sensitivity and local support are widely assumed buyer needs, but no Saudi survey quantifying them was found. Treat them as hypotheses to validate through customer interviews.

### Gaps
- No Saudi survey data on attendance fraud (buddy punching), mobile-app expectations, Arabic UX, support expectations or willingness to pay was found.
- No Saudization rule for restaurant and café roles specifically was verified in this research. The retail turnover percentages are untraceable.
- The full numbers in the Mukatafa report could not be extracted.
- Market-size reports are paywalled and differ by about 2x.

---

## 8. What is the typical price, in SAR per employee per month, for Saudi HR/payroll SaaS for SMEs?

### Takeaway
Published prices are scarce: most local vendors quote on request. The evidence clusters at about **SAR 6–30 per employee per month (PEPM)**, with core HR plus payroll for SMEs typically around **SAR 10–20 PEPM**. Mudad's free basic payroll tier (premium about SAR 460 a year) and Zoho's per-organization pricing set low anchors.

### Cited Findings
- **Jisr:** SAR 10 PEPM for Essential Core HR and SAR 16 PEPM for Professional, with Enterprise on custom terms — [Preqin profile](https://www.preqin.com/data/profile/asset/jisr/566626) **[unofficial]**. Jisr's own pricing page shows plans but no prices — [Jisr pricing](https://www.jisr.net/en/pricing)
- **ZenHR:** quoted per organization based on headcount, countries and bundle — [ZenHR pricing (official)](https://www.zenhr.com/en/zenhr-pricing). A third-party guide gives about USD 3 (about SAR 11) PEPM — [Middle East Insider (Mar 2026)](https://themiddleeastinsider.com/2026/03/02/best-hr-software-small-business-gcc-2026/) **[unofficial]**
- **Zoho Payroll KSA (official, excl. VAT, billed annually):** Standard SAR 35 per organization per month plus SAR 7 per additional employee; Professional SAR 55 plus SAR 11; Premium SAR 75 plus SAR 15 — [Zoho Payroll KSA pricing](https://www.zoho.com/en-sa/payroll/pricing)
- **Palm.HR:** about SAR 19 PEPM, according to a competitor's blog — [Bayzat blog](https://www.bayzat.com/blog/best-hr-software-in-saudi-arabia/) **[competitor-published]**
- **Zoho People:** about SAR 6 PEPM according to Bayzat's blog, versus about SAR 13 according to Shyphan — [Shyphan](https://www.shyphan.com/blog/hrms-software-saudi-arabia.html) **[unofficial; conflicting]**
- **Bayzat:** about SAR 25 PEPM according to Shyphan; SAR 15 per user per month for 1–50 employees according to hr.software — [Shyphan](https://www.shyphan.com/blog/hrms-software-saudi-arabia.html); [hr.software](https://www.hr.software/best-payroll-software/saudi-arabia) **[unofficial]**
- **Zimyo:** SAR 10, 20 or 30 per user per month, with a 25-user minimum — [Zimyo](https://www.zimyo.me/insights/top-payroll-software-in-saudi-arabia/) **[vendor]**
- **Mudad payroll:** free basic tier; premium about SAR 460 a year — [NobleCore Mudad guide](https://noblecoreksa.com/mudad-platform-guide-saudi/) **[unofficial]**
- **Muqeem API add-on** (a cost that passes through to customers wanting Muqeem automation): 12–20% of the pro-rated Muqeem subscription — [Bayzat help](https://help.bayzat.com/en/articles/11636858-muqeem-integration) **[vendor]**

### Inferences
- Example: a 5-branch restaurant group with 60 staff at SAR 10–20 PEPM would pay about **SAR 600–1,200 a month** (SAR 7,200–14,400 a year) before add-ons such as attendance hardware, Muqeem API or premium support.
- Positioning: sitting slightly above the SAR 10 core-HR entry point, with branch-level attendance, scheduling and compliance bundled, looks defensible against Jisr's reported SAR 10/16 tiers. Pricing per active employee per month suits high-turnover sectors, where headcount churns monthly. These are inferences, not market data.

### Gaps
- Few vendors publish official PEPM prices in SAR. Most figures are third-party and some are written by competitors.
- No data was found on discounting, implementation fees or the attendance-hardware costs typical of restaurant and retail deals.

---

## 9. From the objective: which integrations and certifications are table stakes and which are differentiators in 2026?

### Takeaway
The minimum to be shortlisted in 2026 is a correct Saudi payroll (GOSI regimes, WPS/Mudad files, end-of-service), Qiwa contract and Nitaqat awareness, and expiry tracking for expat documents. What actually wins deals is **direct, official-channel connectivity** (Mudad partner integration, the Muqeem/Elm API, Qiwa automation, possibly through Takamol's Tazamon) together with **branch-level operations**: attendance anti-fraud, scheduling, per-establishment compliance and labor cost. Hosting in KSA and NCA alignment are table stakes for government-linked or large buyers and a growing differentiator for SMEs. If SDAIA's draft Art. 23(2) passes, in-Kingdom storage will move toward table stakes.

### Cited Findings
- Incumbents already advertise direct GOSI, Mudad and Muqeem integrations — [Jisr](https://www.jisr.net/en/run-payroll); [ZenHR GOSI](https://www.zenhr.com/en/marketplace-integration/general-organization-for-social-insurance-gosi); [ZenHR Mudad](https://www.zenhr.com/en/marketplace-integration/mudad); [Bayzat Mudad](https://help.bayzat.com/en/articles/11636857-mudad-integration); [Bayzat Muqeem](https://help.bayzat.com/en/articles/11636858-muqeem-integration) **[vendor]**
- Nitaqat counts only Qiwa-documented Saudi contracts from 15 April 2026 — [EIG Law](https://eiglaw.com/?p=14511); [HRSD news](https://www.hrsd.gov.sa/en/media-center/news/توثيق-عقود-العمل-إلكترونياً)
- Takamol's Tazamon, launched at LEAP 2026, lets HR service providers link systems to labor-market platforms — [Makkah Newspaper](https://makkahnewspaper.com/article/1634854/%D8%A3%D8%B9%D9%85%D8%A7%D9%84/%D8%AA%D9%83%D8%A7%D9%85%D9%84-%D8%AA%D8%B7%D9%84%D9%82-%D9%85%D9%86%D8%AA%D8%AC-%D8%AA%D8%B2%D8%A7%D9%85%D9%86-%D9%84%D8%B1%D8%A8%D8%B7-%D8%A3%D9%86%D8%B8%D9%85%D8%A9-%D8%A7%D9%84%D9%85%D9%86%D8%B4%D8%A2%D8%AA-%D8%A8%D9%85%D9%86%D8%B5%D8%A7%D8%AA-%D8%B3%D9%88%D9%82-%D8%A7%D9%84%D8%B9%D9%85%D9%84)
- Draft PDPL Art. 23(2) on in-Kingdom storage is under consultation until 5 November 2026 — [Clyde & Co](https://www.clydeco.com/en/insights/2026/10/sdaia-publishes-draft-amendments-to-the-pdpl)
- Zoho markets Saudi hosting and NCA "Class-B" status — [Zoho](https://www.zoho.com/blog/en-mea/general/zoho-ksa-nca-compliance.html)
- Jisr integrates with Qoyod accounting by API, posting payroll, social insurance and end-of-service entries — [Qoyod marketplace: Jisr](https://www.qoyod.com/en/marketplace/hr-payroll/jisr/) **[vendor]**

### Inferences
**Table stakes (needed to be shortlisted by a Saudi SME in 2026):**
1. A Saudi payroll engine: GOSI legacy and new-entrant rates with the yearly July steps to 2028, expatriate occupational hazards, the SAR 45k cap, and end-of-service benefits.
2. WPS: Mudad-ready SIF and bank files, plus pre-checks for the August 2025 violation types.
3. Qiwa contract-status mirroring and a Nitaqat calculator per establishment that counts only authenticated contracts.
4. Iqama, passport and permit expiry tracking with staged alerts.
5. An Arabic/English UI and payslips, and a mobile employee self-service app. These are assumed rather than evidenced by a survey.
6. An accounting export or integration with Qoyod, Zoho Books and similar.
7. A PDPL baseline: privacy notices, DPO where required, a breach process, and documented transfer mechanisms.
8. For Shuoon's own billing: ZATCA Phase-2-compliant invoicing (Wave 25 threshold SAR 187.5k; deadline 1 Feb 2027).

**Differentiators (that win deals):**
1. A certified Mudad partner integration and bank WPS APIs.
2. Muqeem/Elm API transactions (exit/re-entry, iqama renewal) inside the HR workflow.
3. Qiwa write-actions through an official channel, possibly as an early Tazamon partner.
4. GOSI cross-check and write-back.
5. Branch-first operations: geofenced or face-verified attendance, 24/7 shift scheduling, labor cost per branch including government fees, and Saudization per establishment.
6. Sector packs: Balady health certificates for restaurants, SCFHS and pharmacy/dental quotas for clinics, TGA driver compliance for logistics, Ajeer for contracting, sales/marketing quotas for retail.
7. In-Kingdom hosting with an NCA-aligned posture: table stakes for government-linked buyers and a selling point for SMEs.
8. Capturing ZATCA e-invoices in expense claims.

### Gaps
- No official partner or API programs could be verified for GOSI, Mudad, Qiwa (Tazamon), Muqeem or Absher Business. Eligibility, cost and timelines for a new vendor to gain certified access are unknown, and these determine how quickly Shuoon could reach differentiator status.
- No Saudi buyer survey validates how buyers rank these differentiators.
