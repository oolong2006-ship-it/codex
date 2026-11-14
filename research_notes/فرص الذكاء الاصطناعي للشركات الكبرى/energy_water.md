# AI-native B2B opportunities in Saudi/GCC energy and water (as of Oct 2026)

Scope note: These are research notes for a report writer. The excluded ideas (solar soiling, building-cooling VPP/demand response, P&ID copilot, generic vibration PdM) are left out. Several primary sites (desal.kaust.edu.sa, arabnews.com) could not be fetched from this session, so some figures come from search-result snippets of those pages and are marked as such. Vendor performance numbers are vendor claims, not audited results.

Candidate problem areas, ranked by fit (software on data the customer already owns, a real GCC gap, a buyer with budget):
1. Optimization of seawater RO desalination operations (fouling, CIP timing, chemical dosing, energy). STRONGEST.
2. Non-revenue water (NRW) and leak/burst analytics for city water networks. STRONG.
3. Electricity distribution losses, meaning non-technical loss (theft and anomalies) and distribution transformer health, on SEC smart-meter data. STRONG but has one buyer.
4. Optimization of district cooling plants (chiller sequencing, TES, load forecasting). MEDIUM: crowded at the top end.
5. Artificial lift/ESP and well-operations optimization in oil & gas. WEAK for a new entrant: incumbents dominate.
6. Flaring/methane MRV and emissions reporting. WEAK in KSA at present.

---

## Q1: Where do operators lose the most money, and how much?

### Takeaway
The biggest documented losses that software can address are in water. Desal energy and fouling are the largest opex lines of SWRO plants, and about 30% of water in distribution networks is reportedly lost. In power, Saudi T&D losses are about 8.9% of generation (39.7 TWh in 2024), and SEC has spent SAR 9.56bn on 10M smart meters whose data is under-exploited. Flaring in KSA is low-intensity by global standards, so it is a weaker money pool.

### Cited Findings

**1. Desalination (SWRO) energy, fouling, chemicals**
- SWA says conventional desalination plants typically consume 4-5 kWh/m3. Its mobile RO unit at Yanbu reached 1.55 kWh/m3, which it claims is a global record, and the earlier benchmark was Shuaibah 5 at 1.7 kWh/m3 (664,000 m3/day). — [Fast Company ME](https://fastcompanyme.com/?p=96021); [Gulf Construction Online](https://gulfconstructiononline.com/ArticleTA/461993); [HumanProgress](https://humanprogress.org/saudi-arabia-sets-desalination-energy-efficiency-record/)
- ACWA Power's CEO said in 2022 that the sector had moved from 15+ kWh/m3 (thermal) to about 2.8-2.9 kWh/m3 (membrane) over roughly a decade. — [Arab News (2022)](https://www.arabnews.pk/node/2160976)
- Arab News (2026), quoting a KAUST professor via the search snippet: an AI-based monitoring example at a Jeddah plant reported 7% lower power consumption, 15% less chemical use and 8% more water output. Commercial adoption is still limited, and the cost and complexity of upgrading existing plants are the main barriers. — [Arab News](https://www.arabnews.com/saudi-arabia/how-ai-is-reshaping-the-desalination-industry-in-saudi-arabia-3000569) (snippet only; the page could not be fetched)
- KAUST's DESAL centre and ACWA Power (Jan 2026) are running AI research on early detection of RO membrane fouling, combining sensor data with imaging of the membrane surface. — [KAUST DESAL news](https://desal.kaust.edu.sa/news/2026/01/28/desal-and-acwa-power-advance-ai-based-research-for-early-membrane-fouling-detection) (snippet only)
- A 2025 review of AI for membrane regeneration finds that data quality, interpretability and generalization are still the key hurdles. — [PMC12371207](https://pmc.ncbi.nlm.nih.gov/articles/PMC12371207/)
- Pipeline scale: SWPC IWPs include Jubail 4 & 6 (600,000 m3/day, bid evaluation done in 2026), Jubail 3B (570,000 m3/day), Rabigh 4 (600,000 m3/day, ACWA Power/Almoayyed/HAACO, 25 years, COD planned Q1 2026), Shuqaiq 3 (Marubeni/Abdul Latif Jameel/Acciona/Rawafid) and Yanbu 4. — [MEED](https://guest.meed.com/saudi-arabia-completes-jubail-4-6-evaluation); [Smart Water Magazine](https://smartwatermagazine.com/news/water-electricity-llc/preferred-bidder-shuqaiq-3-iwp-project-saudi-arabia-appointed); [Technical Review ME](https://technicalreviewmiddleeast.com/water-a-environment/rabigh-4-desalination-plant-unveiled)
- One report says the Jubail 4&6 contract (over $200m) went to China TianChen Engineering, which conflicts with the MEED report that evaluation was only just finished. The award status is unconfirmed. — [MEED](https://guest.meed.com/saudi-arabia-completes-jubail-4-6-evaluation)
- ACWA Power is developing a SAR 2.54bn desalination project (July 2026). — [Eye of Riyadh](https://www.eyeofriyadh.com/news/details/acwa-power-to-develop-sar-2-54-billion-desalination-project-in-saudi-arabia)

**2. Water distribution losses (NRW)**
- The Ministry of Environment, Water and Agriculture (MEWA) estimated water lost in networks at about 30%, against about 7% at global best practice (article date not confirmed). — [Al Watan](https://www.alwatan.com.sa/ampArticle/1019464)
- NWC hired SUEZ on a 2-year, EUR 4.4m NRW-management consultancy linked to National Water Strategy targets. — [Smart Water Magazine](https://smartwatermagazine.com/news/suez/suez-awarded-a-strategic-water-consultancy-services-contract-saudi-arabia)
- NWC awarded Aqualia a 2-year, EUR 27m (about $37m) contract to manage leaks in Riyadh. — [MEED](https://www.meed.com/aqualia-wins-saudi-arabia-water-management)
- Alkhorayef Water & Power won a SAR 101.3m, 36-month Al Khobar contract covering leak detection, emergency maintenance and water-quality monitoring, and has other NWC O&M wins (SAR 166.9m in 2026, an NWC $95.4m contract with Veolia). — [DMC/Alkhorayef](https://dmc-education.com/2026/07/15/alkhorayef-water-power-technologies-wins-sar-166-9-million-water-infrastructure-om-contracts-in-saudi-arabia-under-vision-2030/); [IDA](https://idadesal.org/nwc-awards-95-4mn-contract-to-alkhorayef-veolia-partnership)
- An ABB case study on Riyadh notes leakage across about 6,000 miles of pipe as a major loss. — [ABB poster](https://library.e.abb.com/public/3300c772b67142bd807327f60b20bd4e/Poster%20-%20Riyadh%20City%20Water.pdf)
- One trade article says Middle East utilities tend to manage water reactively. — [Water Online](https://www.wateronline.com/doc/non-revenue-water-losses-in-the-middle-east-challenges-and-solutions-0001)

**3. Power grid losses, NTL and transformers**
- Saudi distribution losses were 39.73 TWh in 2024 (8.9% of generation), up from 6.3% in 2014. This is a secondary aggregator figure, not from SEC filings. — [Worldometers](https://www.worldometers.info/electricity/saudi-arabia-electricity/)
- SEC signed contracts for 10 million smart meters worth SAR 9.56bn (Dec 2019). — [Argaam](https://www.argaam.com/en/article/articledetail/id/1337412)
- A KAUST-SEC machine learning project on 5 years of Riyadh billing data found circuit-breaker capacity anomalies that could recover at least SAR 73m. Saudi non-technical losses are described as significantly higher than in Europe and North America. — [KAUST](https://www.kaust.edu.sa/news/kaust-helps-slash-sec-profit-losses-using-ml); [KAUST CoreLabs](https://corelabs.kaust.edu.sa/news/2020/06/15/collaboration-reduces-losses-in-saudi-power-sector)
- Global NTL cost is about $96bn a year (Northeast Group, cited in a KFUPM thesis). — [KFUPM eprints](https://eprints.kfupm.edu.sa/id/eprint/140852/)

**4. District cooling**
- Saudi government target: about 3 million TR of district cooling by 2030. Saudi Tabreed had 326,350 RT across 5 concessions. Example projects: KAFD 100,000 RT, Jabal Omar 55,000 RT, Aramco Dhahran 27,000-32,000 TR. — [Khaleej Times](https://www.khaleejtimes.com/business/district-cooling-projects-offer-opportunities-worth-15-billion); [MEED](https://www.meed.com/tabreed-starts-cooling-services-for-king-abdullah-financial-district/)
- Tabreed increased its stake in Saudi Tabreed. — [Argaam](https://www.argaam.com/en/article/articledetail/id/1336944)
- No plant kW/RT benchmark for Saudi district cooling was found (see Gaps).

**5. Oil & gas: flaring, ESPs**
- Saudi Arabia flared about 2.5 bcm in 2023, a 31% increase. In the 2025 tracker it had one of the lowest flaring intensities among top flarers (with the US). Globally, flaring was 151 bcm in 2024, and the World Bank values global wasted gas at about $63bn. — [S&P Global](https://www.spglobal.com/energy/en/news-research/latest-news/crude-oil/062324-iran-takes-over-for-iraq-as-worst-gas-flaring-country-after-russia); [World Bank 2025 tracker](https://www.worldbank.org/en/programs/gasflaringreduction/publication/2025-global-gas-flaring-tracker-report); [WAM](https://www.wam.ae/en/article/15oej7y-global-gas-flaring-surged-for-second-year-row)
- GCOM (Saudi Greenhouse Gas Crediting and Offsetting Mechanism, launched Oct 2023) is a voluntary, project-based scheme aligned with Article 6. No methane-specific company MRV obligations were found. — [Climate Scorecard](https://www.climatescorecard.org/2024/02/saudi-arabias-greenhouse-gas-crediting-and-offsetting-mechanism-gcom/)

### Inferences
- Rough value of desal energy (my calculation, not sourced): a 600,000 m3/day plant at about 3 kWh/m3 uses about 1.8 GWh/day, or about 657 GWh/yr. A 5-7% AI saving would be 33-46 GWh/yr per plant. The SAR value depends on the plant's PPA/fuel price, which was not found. Chemicals and membrane replacement add more, and the claimed 15% chemical cut is meaningful.
- Value of KSA flaring (my calculation): applying the World Bank global ratio (~$63bn / 151 bcm ≈ $0.42/m3) to 2.5 bcm gives about $1bn/yr. But the low intensity and Aramco's long-standing in-house programs make it a poor target for a startup.
- If 8.9% losses are applied to Saudi generation, even a 1-percentage-point cut in NTL is worth several TWh a year. That is a large prize, but it is concentrated in one buyer, SEC.

### Gaps
- No primary NWC annual NRW % figure was found (only the MEWA ~30% via Al Watan, undated).
- No official KSA total desal production or SWA/SWPC cost per m3 (SAR/m3) was retrieved in this session.
- No SEC-reported figure for technical vs non-technical loss split, and no transformer failure rate or cost.
- No kW/RT efficiency benchmarks for Saudi district cooling plants.

---

## Q2: Which areas lack a credible AI product in KSA/GCC, or have competitors that miss a key angle?

### Takeaway
Desal operations has only one visible commercial AI deployment in KSA (Pani at SAWACO's SOJECO), plus research (KAUST-ACWA). That makes it the clearest gap, especially for the 2025-2030 IWP fleet operated by ACWA Power, SWA and the IWP consortia. NRW analytics has global leaders (TaKaDu/Xylem, Aquarius Spectrum) but no confirmed Saudi deployment, and the market is fragmenting into regional O&M contracts. District cooling and ESP are already contested by Engie, Johnson Controls, SLB, Baker Hughes and the UAE's AIQ.

### Cited Findings

**Desalination: competitors**
- Pani Energy (Canada) offers SaaS "digital operational twin" decision support. SAWACO (Saudi Brothers Commercial Group) deployed it at the SOJECO plant in Jeddah to improve recovery, cut energy and extend membrane life. Pani claims up to 20% energy reduction and 20-35% longer membrane life from condition-based cleaning (vendor claims, and dates conflict across sources: 2021 vs 2026). — [Smart Water Magazine](https://smartwatermagazine.com/news/pani-energy/sawaco-water-desalination-implements-pani-intelligent-decision-support-sojeco-plant); [IDA](https://backup1.idadesal.org/sawaco-water-desalination-implements-pani-intelligent-decision-support-at-sojeco-plant-in-jeddah/); [Yespress](https://yespress.io/pani)
- KAUST DESAL and ACWA Power: fouling-detection research, not a product. — [KAUST DESAL](https://desal.kaust.edu.sa/news/2026/01/28/desal-and-acwa-power-advance-ai-based-research-for-early-membrane-fouling-detection)
- ACCIONA (Spain): an AI biofouling-potential prediction tool validated at San Pedro del Pinatar SWRO. ACCIONA is also an IWP developer in KSA (Shuqaiq 3), so it could build in-house. — [search result, Aquatech/sciforum](https://sciforum.net/paper/23701)
- A LinkedIn profile mentions a SAWACO project with NEC Labs on AI for desal (unverified). — [LinkedIn](https://sa.linkedin.com/in/mali830)

**NRW: competitors**
- TaKaDu: cloud AI event management, live 24/7 at utilities in 13 countries. Aquarius Spectrum (acoustic, acquired by Aliaxis in 2022) has integrated with TaKaDu. No GCC deployment was found for either. — [NoCamels](https://nocamels.com/2023/12/israeli-ai-platform-spots-leaks-saves-water-worldwide/); [TaKaDu](https://www.takadu.com/news-and-updates/aquarius-spectrum-and-takadu-announce-integration-partnership-for-effective-water-management/); [Startupim](https://startupim.com/company/aquarius-spectrum)
- DEWA (Dubai) built in-house AI/deep learning (Hydronet) for network monitoring, leaks and smart-meter fraud. — [Khaleej Times](https://www.khaleejtimes.com/business/energy/dubais-dewa-uses-ai-to-improve-efficiency-monitor-cyberattacks-identify-leaks-faults)
- Incumbent NRW contractors in KSA: SUEZ, Aqualia, Veolia/Alkhorayef, Amiantit's unit, ABB (Riyadh SCADA). — sources in Q1.

**Grid: competitors**
- Hitachi Energy: TXpert transformer monitoring, and HMAX Energy (April 2026), which combines digital twins and predictive analytics and claims up to 50% fewer transformer failures. No SEC deal for it was found. Hitachi does have NEOM transmission work with SEC/ENOWA (2023) and an SF6-free switchgear MoU. — [EEPower](https://eepower.com/new-industry-products/hitachi-energy-launches-ai-powered-suite-for-infrastructure/); [Hitachi TXpert](https://www.hitachienergy.com/news-and-events/events-and-webinars/2023/12/customer-transformer-training-webinar-series-2023/txpert-ecosystem-digitalization-of-transformers)
- Siemens offers transformer digital-model tools. — [Siemens webinar](https://webinars.sw.siemens.com/zh-CN/transformer-behavior-using-digital-models/)
- KAUST has already shown NTL machine learning on SEC data, so the academic proof exists but the product gap remains. — [KAUST](https://www.kaust.edu.sa/news/kaust-helps-slash-sec-profit-losses-using-ml)

**District cooling: competitors (crowded)**
- Tabreed runs 92 plants in 6 countries from an Abu Dhabi hub, is fully automated with 24/7 monitoring, and is moving to AI optimization. — [WAM](https://www.wam.ae/en/article/bjx2tgd-tabreed-operates-ai-managed-plants-countries-from)
- Engie Digital's NEMO AI is deployed across a 235,000 RT Tabreed network in Dubai. — [Energy Utilities](https://energy-utilities.com/tabreed-and-engie-digital-develop-ai-technology-news117674.html)
- Johnson Controls and Tabreed signed a long-term agreement (Sep 2025) for high-efficiency chillers plus analytics for real-time optimization. — [Johnson Controls](https://me.johnsoncontrols.com/media-center/news/press-release/2025/09/22/tabreed-and-johnson-controls-enter-long-term-agreement)
- Tabreed uses AI to predict customer demand. — [Gulf News](https://gulfnews.com/business/corporate-news/abu-dhabis-tabreed-will-use-ai-to-predict-customer-demand-1.77506203)

**O&G ESP/artificial lift: competitors (crowded)**
- Baker Hughes Leucipa ESP Optimizer (AI plus physics) claims an 80% failure reduction in a 157-well ExxonMobil pilot (vendor claim). — [Baker Hughes](https://www.bakerhughes.com/oilfield-services-and-equipment-digital/leucipa-automated-field-production-solution/leucipa-esp-optimizer); [Case study](https://dam.bakerhughes.com/m/6d9e02a632fdc7e4/original/Case-Study_Leucipa-delivers-operational-efficiency-for-ExxonMobil.pdf)
- SLB Tela/OptiFlow (autonomous ESP optimization) and Lift IQ have case studies in Oman. — [SLB](https://www.slb.com/products-and-services/delivering-digital-at-scale/software/tela/tela-catalog/esp-optimization); [SLB Oman](https://www.slb.com/zh-cn/resource-library/case-study-with-navigation/al/lift-iq-oman-cs)
- AIQ (UAE) markets a FORESIGHT ESP failure-prediction product on the Microsoft Marketplace. — [Microsoft Marketplace](https://marketplace.microsoft.com/ar-sa/product/aiq_uae.foresight_pilot)

### Inferences
- **Desal gap and angle:** Pani is the only visible commercial player in KSA, and it is plant-by-plant decision support. Angles a new entrant could own:
  - (a) Fleet-level optimization across the IWP portfolio of ACWA Power/SWA.
  - (b) Closed-loop control, using RL/MPC for chemical dosing (antiscalant, SBS, chlorination) and CIP scheduling tied to Gulf/Red Sea seawater events (algal blooms/HABs, temperature, salinity).
  - (c) Multimodal fusion of SDI/lab data, autopsy reports and membrane imaging, which is the same direction KAUST-ACWA are researching.
  - (d) Contract and KPI optimization against IWPA penalties and guaranteed availability.
  - (e) Arabic-language operator agents.
- **NRW gap:** The global leaders are absent from KSA, but they are partly Israeli-origin (TaKaDu), which is a likely procurement barrier in KSA. That leaves room for a neutral/local vendor that sells to the regional O&M contractors (Veolia-Alkhorayef, Aqualia, SUEZ) as well as NWC. The angle is DMA-level anomaly detection, pressure management optimization and hydraulic-model calibration from existing SCADA and AMI data.
- **Grid NTL/transformer:** Hitachi, Siemens and GE sell hardware-tied suites. A software-only layer on SEC's 10M-meter AMI data (theft, meter tamper, transformer overload and thermal-ageing estimation from meter aggregation, without new sensors) is a differentiated angle. But there is effectively one buyer, so sales are long and concentrated.
- District cooling: the top player (Tabreed) already uses Engie and JCI, so the opening is limited to smaller/new Saudi concessionaires and in-house plants (e.g., Aramco, ROSHN, giga-projects). The 3M TR by 2030 target means many new plants. Note that it overlaps with the rejected "building cooling" theme in buyer perception.
- O&G: Aramco, SLB, Baker Hughes, Halliburton and AIQ cover it. Not recommended.

### Gaps
- Not confirmed: whether Xylem/TaKaDu, Veolia (Hubgrade), Suez (Aquadvanced), Bentley or Innovyze have current KSA NRW deployments. Searches returned none, but absence is not proof.
- Not confirmed: Aramco's in-house AI programs for ESP/flaring and Aramco Digital's offerings (not searched within the call budget).
- No Saudi/GCC AI startups specifically in desal or NRW were found via Magnitt/Crunchbase (not reachable in this session).
- Whether DuPont, Veolia or Toray membrane-projection/monitoring software is used at Saudi plants is unverified.

---

## Q3: Which can be delivered as software on data the customer already owns (no heavy new hardware)?

### Takeaway
Desal RO optimization, NRW analytics on existing SCADA/DMA/AMI data, and NTL/transformer analytics on SEC's smart-meter data are all mostly software-only. District cooling is software-only too, but crowded. ESP optimization needs downhole data the service companies control. Flaring/methane MRV often needs satellites or sensors.

### Cited Findings
- The Pani SOJECO deployment is SaaS decision support on existing plant data. — [Smart Water Magazine](https://smartwatermagazine.com/news/pani-energy/sawaco-water-desalination-implements-pani-intelligent-decision-support-sojeco-plant)
- The KAUST-SEC NTL work used only existing billing data (5 years, Riyadh). — [KAUST](https://www.kaust.edu.sa/news/kaust-helps-slash-sec-profit-losses-using-ml)
- SEC's 10M smart meters are already installed and paid for (SAR 9.56bn). — [Argaam](https://www.argaam.com/en/article/articledetail/id/1337412)
- Barrier: Arab News reports that the cost and complexity of upgrading existing desal plants limits AI adoption. — [Arab News](https://www.arabnews.com/saudi-arabia/how-ai-is-reshaping-the-desalination-industry-in-saudi-arabia-3000569) (snippet)
- Barrier: data quality, interpretability and generalization in membrane AI. — [PMC review](https://pmc.ncbi.nlm.nih.gov/articles/PMC12371207/)
- Tabreed already has full automation and 24/7 monitoring, so its data is there, but so are its vendors. — [WAM](https://www.wam.ae/en/article/bjx2tgd-tabreed-operates-ai-managed-plants-countries-from)

### Inferences: obstacles by area
- **Desal:** No government API dependency, since the data sits in the plant's DCS/historian (OSIsoft PI/AVEVA, etc.) plus LIMS. The obstacles are:
  - OT cybersecurity: the NCA OTCC controls likely require on-premise or air-gapped deployment and Saudi data residency.
  - Conservative operators who accept only advisory mode before closed loop.
  - Membrane warranties from OEMs.
  - IWPA risk allocation, because the developer bears performance risk and so is motivated, but also risk-averse.

  Best initial buyers: ACWA Power (operator through NOMAC), SWA (state-owned fleet), SAWACO, Marafiq (Jubail/Yanbu) and IWP consortia (Marubeni, Acciona, Abdul Latif Jameel, Haaco, Almoayyed).
- **NRW:** It needs DMA metering and pressure logging, and some districts lack it, which means light hardware. The procurement chain runs NWC → regional cluster contractor, so a vendor may need to sell through the O&M contractors. Water privatization (regional clusters under the National Center for Privatization) creates new private buyers.
- **Grid NTL/transformer:**
  - The data sits with SEC (and the SEC Distribution unit). There is no external government API, but there is data-sharing approval and regulatory oversight (Water & Electricity Regulatory Authority, formerly ECRA).
  - Single-buyer concentration.
  - Incumbent AMI head-end vendors may claim analytics.
- **District cooling:** Software-only via BMS/SCADA, but incumbent OEM analytics (JCI, Trane, Engie) bundled with chillers are already present.
- **O&G ESP and flaring:** Needs data access through the service companies or Aramco's own platforms. Aramco has long pursued in-house digital work (unverified here), and methane/flare MRV often needs satellites (e.g., GHGSat/Kayrros, not searched) or new sensors. It fails the "no heavy hardware/no gatekeeper" test.

### Gaps
- No public document was found on NCA OT cybersecurity requirements for water and power operators (not searched within the call budget).
- Data-sharing rules of SEC and the Water & Electricity Regulatory Authority for third-party analytics are unknown.
- Pricing benchmarks (SaaS per plant / per m3 / per meter) for these products in the GCC were not found.
