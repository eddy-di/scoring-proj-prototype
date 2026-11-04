# Apartment question catalogue

284 candidate questions for assessing an apartment, shaped to fit this app's question library and methodology
editor. Pick the ones you want, add them under **Questions**, then build a methodology from them under **Methodologies**.

Source: `apartment_acquisition_scoring_questionnaire.md` (v1.0). Its question numbers are kept, so each entry can be traced
back. The answer types, wording changes, option lists, "better" directions and suggested methods are proposals: change any
of them. The questions themselves have no weights, thresholds or scores, because those belong to the methodology and
depend on your city, household and strategy.

**Ready-made fixtures:** all of these questions are in `backend/library/fixtures/apartment_questions.json`, and two draft
methodologies built from them are in `backend/methodologies/fixtures/`. See *Apartment assessments* in `backend/README.md`.

**Contents:** [Do this first](#do-this-first) · [How an entry maps to the app](#how-an-entry-maps-to-the-app) ·
[Building the methodology](#building-the-methodology) · [Knock-out candidates](#knock-out-candidates) ·
[What the app can't do yet](#what-the-app-cant-do-yet) · [Part I: General](#part-i-general-both-property-types) ·
[Part II: Existing property](#part-ii-existing-property) · [Part III: Under development](#part-iii-property-under-development)

## Do this first

**1. Load the catalogs.** `manage.py loaddata catalogs` brings in the units, scales and object types this file uses. It
overwrites any catalog record with the same ID, and fails if you added the same code by hand under another ID.

**2. Use the object types.** A methodology is written for one object type, and respondents only see methodologies for their
object's type. Questions can be shared between methodologies, so a natural setup is:

| Object type | Methodology | Questions from |
|---|---|---|
| `apartment_existing` | e.g. `APT_EXISTING` | Part I + Part II |
| `apartment_development` | e.g. `APT_DEVELOPMENT` | Part I + Part III |

You'll also need to add the apartments themselves as objects, since the catalogs don't include any.

A number question has one unit. Prices use `cur`, meaning your local currency; rename it to `KGS`, `USD` or whichever you use.
Counts use `pcs`, and the question text states the period ("per year"). These are the units the entries use:

| Unit code | Name | Questions using it |
|---|---|---|
| `%` | Percent | 33 |
| `pcs` | Pieces (any count) | 17 |
| `yr` | Year | 7 |
| `cur` | Local currency | 5 |
| `day` | Day | 4 |
| `mo` | Month | 4 |
| `min` | Minute | 3 |
| `W/(m²·K)` | Thermal transmittance (U-value) | 3 |
| `m²` | Square metre | 2 |
| `cur/m²` | Local currency per m² | 2 |
| `cur/mo` | Local currency per month | 2 |
| `dB(A)` | A-weighted decibel | 2 |
| `kW` | Kilowatt | 2 |
| `mm` | Millimetre | 1 |
| `h` | Hour | 1 |
| `kWh/m²·yr` | Kilowatt-hours per m² per year | 1 |
| `cur/m²/mo` | Local currency per m² per month | 1 |
| `Mbps` | Megabits per second | 1 |
| `µg/m³` | Micrograms per m³ | 1 |
| `dB` | Decibel | 1 |
| `bar` | Bar | 1 |
| `°C` | Degree Celsius | 1 |

The catalogs have more units for the source's other measures, such as `km`, `cm`, `kPa`, `lux` and `MPa`, and two extra
scales: `quality_10` and `quality_0_5`.

**3. Add the categories.** Categories have no code, only a name. Use one top-level category per part with its sections
inside, as listed in each part below.

**4. Decide about translations.** Question text and option labels are required in English, Russian and Kyrgyz by default,
and this catalogue is English only. Either translate what you pick, or add `REQUIRED_CONTENT_LANGUAGES=en` to `backend/.env`
while you experiment. Missing translations then fall back to English.

## How an entry maps to the app

```text
#### 1.1.2 Public transport access  `LOC_TRANSIT_WALK`     source number, node name, question code
- Question   the wording respondents see                  Question → Question
- Guidance   what to check, from the source               Question → Guidance
- Answer     type, unit or scale, and options             Question → Answer type, Unit, Scale, Options
- Better     which answers should score high              used later, in the scoring rule
- Method     suggested assessment method                  methodology node → Assessment method
- Source measures  everything the source suggests recording  respondent's comment or evidence
```

The app stores **one answer per question**, while the source often lists several measures for one question, such as metres,
minutes and transfers. Each entry therefore has one main answer, and **Source measures** lists everything the source suggests recording. Anything besides the main answer goes in the respondent's comment or evidence. If one of
those matters enough to score, add it as another question with its own code.

- **Rating questions** usually keep the source wording and are answered on a scale. They suit judgements that combine several
  observations.
- **Number questions** are reworded to ask for one value (117 entries in total have changed wording, and the original
  is shown beside each).
- **`Better: no`** on a yes/no question means "No" is the good answer, as in "Are there court proceedings…?".

Answer types proposed: 87 ratings (79 `quality_5`, 4 `agreement_5`, 4 `frequency_5`), 93 yes/no, 95 numbers, 9 single choice.

## Building the methodology

The steps below are in the order the editor needs them.

1. **Create the methodology** for an object type. This creates draft version 1.0 and a root node. Choose a **result scale**,
   for example `quality_5`.
2. **Add group nodes** under the root. The source's sections work well as groups, such as "Location and accessibility".
3. **Add question nodes** under each group. Use the entry's heading as the node name.
4. **Set weights.** In a weighted group, sibling weights must add up to 1, or the version can't be published.
5. **Add a scoring rule** to each question node, chosen by answer type:

| Answer type | Scoring method | Set this up |
|---|---|---|
| Number, `Better: lower` or `higher` | Linear between worst and best | Worst and best values; worst can be the larger number |
| Number, `Better: target` | Linear towards a target | Lower limit, target, upper limit |
| Number, in bands | Criteria lookup | Ranges with no gaps or overlaps; the lower bound is included, the upper is not |
| Yes / no | Criteria lookup | A criterion for both Yes and No, or the version can't be published |
| Single choice | Criteria lookup | A criterion for every option, or the version can't be published |
| `quality_5`, on a 1–5 result scale | Use the answer as the score | Nothing else |
| `agreement_5` | Use the answer as the score | Nothing else |
| `frequency_5` | Linear between worst and best | Worst 5, best 1, because "Always" is the bad end |
| `quality_10`, on a 1–5 result scale | Linear between worst and best | Worst 1, best 10, so the score isn't above 5 |
| `quality_0_5`, on a 1–5 result scale | Linear between worst and best | Worst 0, best 5, so a 0 still gives a valid score |

6. **Mark knock-outs and optional questions.** A knock-out threshold fails the object when the score falls below it. A question
   that isn't mandatory doesn't block completion.
7. **Add an assessment method** to each question node. Without one you only get a warning, but respondents then have no
   instructions.
8. **Validate and publish.** Published versions can't be edited, so changes need a new version.

Start small. A first version with 3–4 groups and 10–15 questions is much easier to check by hand than a large one, and you can
copy it into a new version afterwards.

## Knock-out candidates

The source treats these as decision gates rather than ordinary weighted questions. In the app, give each one a **knock-out
threshold**, for example score 1 for the bad answer and threshold 2. The result then shows as failed whatever the total is.
A number or rating question needs its threshold set against your own scoring rule.

| Applies to | Code | Node |
|---|---|---|
| Both | `BLD_FIRE_SAFETY` | Fire safety |
| Existing | `EX_STR_CRACK_WIDTH` | Structural cracks and deformation |
| Existing | `EX_STR_ALTERATIONS` | Unauthorized structural alterations |
| Existing | `EX_STR_SEISMIC` | Seismic performance and assessment |
| Existing | `EX_COM_FIRE_MAINTAINED` | Fire protection in common areas |
| Existing | `EX_APT_ALTERATIONS_MATCH` | Unauthorized modifications |
| Existing | `EX_LEG_SELLER_OWNER` | Seller identity and registered ownership |
| Existing | `EX_LEG_ENCUMBRANCES` | Encumbrances and restrictions |
| Existing | `EX_LEG_COURT_ACTIONS` | Court and enforcement restrictions |
| Existing | `EX_LEG_RECORDS_CONSISTENT` | Registration and technical passport |
| Development | `DV_DEV_LEGAL_IDENTITY` | Company registration and legal identity |
| Development | `DV_LEG_LAND_RIGHTS` | Land rights and registration |
| Development | `DV_LEG_AUTHORIZATION` | Construction authorization |
| Development | `DV_LEG_APPROVED_DESIGN` | Approved project documentation |
| Development | `DV_LEG_CHANGES_APPROVED` | Project modifications and approvals |
| Development | `DV_CTR_ENTITY` | Contracting entity and legal form |
| Development | `DV_CTR_PAYMENTS_PROTECTED` | Payment protection |

The source's list is broader in wording than single questions, so this mapping is my reading of it. It also notes that these
are screening principles, not a substitute for legal advice where the property is located.

## What the app can't do yet

The source's Part IV and V describe a few things the app has no direct support for. None of them stops you from building a
methodology, but they're worth knowing.

| Source idea | In the app today | Workaround |
|---|---|---|
| Answer states Unknown, Pending, Contradictory | An answer is given, Not applicable, or missing. A missing mandatory answer blocks completion | Make uncertain questions optional, and explain in the comment |
| N/A left out of the score | Supported: Not applicable is left out and the sibling weights are rescaled | None needed |
| Score scale 0–5 | `quality_0_5` has the source's levels, including "Critical" | Swap it in on rating questions, and map it onto your result scale with a linear rule |
| Evidence confidence 1–5, verification status | Evidence has a kind, a file or link, and a description, but no confidence field. The scale `evidence_confidence_5` exists | Write it in the description, or add a rating question that uses the scale |
| Separate scores (property, acquisition, investment…) | One tree with one total, though each group's score is shown in the result | Use one top-level group per dimension, or separate methodologies |
| Evidence completeness and coverage % | Progress shows answered / total | None for "independently verified" coverage |
| Calculated indicators (yield, price per m²) | A formula only sees one answer, so it can't combine questions | Calculate outside the app and enter the result; these entries use the Calculation method |
| Date answers | There's no date type | Use a number such as "years since", or note the date in the comment |
| Applicability by stage or purpose | Decided by which methodology a question is in | Use separate methodologies or versions |
| Reassessment at construction milestones | A new assessment of the same object keeps the earlier one | Start a new assessment at each milestone |

The source's question numbers `2.2.3` and `3.1.11` had mistyped sub-numbers (`2.2.2.1` and `3.1.1.1`). This file uses the
section numbers.

---

# Part I: General (both property types)

93 questions. Top-level category: **General (both property types)**. Sections, which are its subcategories:

- 1.1 Location and accessibility (12)
- 1.2 Neighborhood and infrastructure (12)
- 1.3 Urban development and future environment (10)
- 1.4 Apartment characteristics (15)
- 1.5 Building characteristics (10)
- 1.6 Environmental quality (10)
- 1.7 Financial attractiveness (14)
- 1.8 Market liquidity and resale potential (10)

## 1.1 Location and accessibility

#### 1.1.1 Daily travel to work, education, and regular destinations `LOC_COMMUTE_TIME`

- **Question:** What is the typical weekday peak travel time to the household’s main daily destination?
- **Original wording:** How long does it take to reach the household’s primary daily destinations?
- **Guidance:** Record travel time to each relevant workplace, school, university, or other regular destination. Assess typical weekday peak and off-peak conditions separately. Identify whether the route depends on a single road, bridge, or transport connection.
- **Answer:** Number · unit `min`
- **Better:** lower
- **Method:** Instrumental measurement (`measurement`)
- **Source measures:** minutes per trip; kilometres per route

#### 1.1.2 Public transport access `LOC_TRANSIT_WALK`

- **Question:** How many minutes does it take to walk to the nearest usable public transport stop?
- **Original wording:** How accessible are reliable public transport services from the property?
- **Guidance:** Measure walking distance to the nearest usable stop or station. Record routes, service frequency, operating hours, and transfers needed for key destinations. Check whether services operate during the household’s actual commuting hours.
- **Answer:** Number · unit `min`
- **Better:** lower
- **Method:** Instrumental measurement (`measurement`)
- **Source measures:** metres; minutes walking; services per hour; minutes between services; number of transfers

#### 1.1.3 Road access and private vehicle connectivity `LOC_MAIN_ROAD_TIME`

- **Question:** How many minutes does it take to drive to the main road network at typical times?
- **Original wording:** How convenient is access to the main road network?
- **Guidance:** Record the distance and typical driving time to principal roads and destinations. Check access restrictions, one-way streets, bottlenecks, and seasonal road conditions.
- **Answer:** Number · unit `min`
- **Better:** lower
- **Method:** Instrumental measurement (`measurement`)
- **Source measures:** metres or kilometres; minutes

#### 1.1.4 Traffic congestion `LOC_CONGESTION_DELAY`

- **Question:** By what percentage does peak traffic increase travel time compared with off-peak?
- **Original wording:** How much does congestion affect travel from the property?
- **Guidance:** Compare peak-hour and off-peak travel times. Identify recurring bottlenecks near the property. Consider school-term, seasonal, and weekend variations where relevant.
- **Answer:** Number · unit `%`
- **Better:** lower
- **Method:** Calculation (`calculation`)
- **Source measures:** minutes; percentage increase in travel time

#### 1.1.5 Schools and kindergartens `LOC_SCHOOLS`

- **Question:** Are suitable schools and kindergartens accessible to the household?
- **Guidance:** Record distance, route safety, travel time, capacity or admission constraints, and available age groups. Distinguish a facility’s physical proximity from confirmed eligibility or availability.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** metres or kilometres; minutes; number of suitable facilities

#### 1.1.6 Healthcare access `LOC_HEALTHCARE`

- **Question:** How accessible are primary, emergency, and specialist healthcare services?
- **Guidance:** Record distance and travel time to clinics, pharmacies, hospitals, and emergency services. Identify facilities that provide the services the household actually requires.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** metres or kilometres; minutes; number of relevant facilities

#### 1.1.7 Everyday commercial services `LOC_EVERYDAY_SERVICES`

- **Question:** Are essential everyday services available within a practical distance?
- **Guidance:** Check grocery stores, markets, pharmacies, banks, childcare, and other regular services. Record opening hours and whether access is practical on foot.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** metres; minutes walking; number of relevant services

#### 1.1.8 Pedestrian accessibility `LOC_WALKABILITY`

- **Question:** Can residents safely and conveniently walk around the property?
- **Guidance:** Inspect pavement continuity, crossings, lighting, gradients, obstructions, and accessibility for strollers or mobility aids.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** metres of accessible route; number of major road crossings; categorical inspection result

#### 1.1.9 Parking availability `LOC_PARKING`

- **Question:** Is parking realistically available for residents and visitors?
- **Guidance:** Count legally usable spaces and assess allocation, ownership, rental, or permit arrangements. Observe occupancy at different times, including evenings.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** spaces; spaces per apartment; monthly parking cost in local currency

#### 1.1.10 Access for emergency and service vehicles `LOC_EMERGENCY_ACCESS`

- **Question:** Can emergency, delivery, and maintenance vehicles reach the property?
- **Guidance:** Check access roads, turning areas, obstructions, gates, and fire-service access.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Visual inspection (`visual`)
- **Source measures:** metres of access width; metres of clearance; categorical compliance status

#### 1.1.11 Accessibility for household members with limited mobility `LOC_MOBILITY_ACCESS`

- **Question:** Can all relevant household members reach the apartment and shared facilities without unreasonable barriers?
- **Guidance:** Check step-free routes, ramps, lifts, door widths, thresholds, and accessible facilities.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** millimetres; number of steps; ramp gradient as a ratio or percentage

#### 1.1.12 Planned transport improvements `LOC_TRANSPORT_PLANS`

- **Question:** Are transport or road improvements planned that could materially affect accessibility?
- **Guidance:** Identify the project, responsible authority, funding status, approval status, and expected delivery date. Distinguish funded and approved projects from announcements or proposals.
- **Answer:** Single choice
- **Options:** `completed` Completed · `under_construction` Under construction · `funded` Approved and funded · `approved` Approved, not funded · `proposed` Proposed or announced only · `none` Nothing planned
- **Better:** depends on the project
- **Method:** Document review (`documents`)
- **Source measures:** metres or kilometres to project; expected year; project status as a category

## 1.2 Neighborhood and infrastructure

#### 1.2.1 General condition of the neighborhood `NBH_CONDITION`

- **Question:** What is the observable physical condition of the surrounding neighborhood?
- **Guidance:** Inspect streets, sidewalks, public spaces, adjacent buildings, vacant plots, and maintenance. Record visible deterioration, unmanaged land, or recurring nuisance conditions.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** categorical condition rating; number of observed defects per inspection

#### 1.2.2 Public spaces and recreation `NBH_RECREATION`

- **Question:** Are usable public spaces and recreation areas available nearby?
- **Guidance:** Record parks, playgrounds, sports areas, and their condition, access, and maintenance.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** metres; minutes walking; square metres of public open space per resident where data exists

#### 1.2.3 Greenery and tree cover `NBH_GREENERY`

- **Question:** Is there sufficient maintained greenery around the property?
- **Guidance:** Observe tree cover, shade, planting condition, and access to green areas.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** square metres of green space; metres to nearest green area; percentage canopy cover where available

#### 1.2.4 Cleanliness and waste management `NBH_WASTE`

- **Question:** Are streets and shared outdoor areas clean and waste collection reliable?
- **Guidance:** Inspect waste containers, collection frequency, overflow, illegal dumping, and pest evidence.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** collections per week; number of observed overflow incidents; categorical condition rating

#### 1.2.5 Water supply reliability `NBH_WATER_INTERRUPTIONS`

- **Question:** How many water supply interruptions happen per year?
- **Original wording:** Is the local water supply reliable and adequate?
- **Guidance:** Review interruption history, pressure complaints, water quality information, and backup arrangements.
- **Answer:** Number · unit `pcs`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** interruptions per month or year; hours per interruption; pressure in bar or kPa where measured

#### 1.2.6 Electricity supply reliability `NBH_POWER_OUTAGES`

- **Question:** How many electricity outages happen per year?
- **Original wording:** Is electricity supply reliable in the neighborhood?
- **Guidance:** Record outage frequency, duration, voltage issues, and known network constraints.
- **Answer:** Number · unit `pcs`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** outages per month or year; hours; voltage in volts where measured

#### 1.2.7 Heating infrastructure `NBH_HEATING_INTERRUPTIONS`

- **Question:** How many heating interruptions happen per heating season?
- **Original wording:** Is the neighborhood heating infrastructure reliable and adequate?
- **Guidance:** Identify the heating source and network operator. Review seasonal interruptions, known capacity constraints, and connection arrangements.
- **Answer:** Number · unit `pcs`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** interruptions per heating season; hours; heating tariff per kWh or Gcal where available

#### 1.2.8 Sewerage and drainage infrastructure `NBH_DRAINAGE`

- **Question:** Is sewerage and surface-water drainage infrastructure adequate?
- **Guidance:** Check connection type, overflow history, flooding reports, and visible drainage condition.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** categorical connection type; incidents per year; drainage capacity in applicable units where documented

#### 1.2.9 Internet and telecommunications `NBH_INTERNET_SPEED`

- **Question:** What is the measured internet download speed at the property?
- **Original wording:** Are suitable internet and mobile services available?
- **Guidance:** Identify providers, technologies, advertised and measured speeds, and service interruptions.
- **Answer:** Number · unit `Mbps`
- **Better:** higher
- **Method:** Instrumental measurement (`measurement`)
- **Source measures:** Mbps download/upload; milliseconds latency; providers available; monthly cost

#### 1.2.10 Neighborhood safety `NBH_SAFETY`

- **Question:** What safety risks are documented or observable in the immediate area?
- **Guidance:** Review credible incident data where available and inspect lighting, visibility, access control, and street activity. Avoid relying solely on subjective reputation.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** incidents per year or per 1,000 residents where reliable data exists; lux for measured lighting; categorical assessment

#### 1.2.11 Social environment and nuisance `NBH_NUISANCE`

- **Question:** How often do social or land-use nuisances disturb the property?
- **Original wording:** Are there recurring social or land-use nuisances near the property?
- **Guidance:** Identify late-night venues, markets, workshops, industrial uses, informal trading, and recurring disputes. Record frequency and time of disturbance.
- **Answer:** Rating on a scale · scale `frequency_5`
- **Better:** lower
- **Method:** Visual inspection (`visual`)
- **Source measures:** metres; events per week or month; measured noise in dB(A)

#### 1.2.12 Neighborhood services and maintenance `NBH_MAINTENANCE`

- **Question:** Are public infrastructure and shared neighborhood facilities maintained?
- **Guidance:** Check street repairs, lighting, drainage, playgrounds, and public-space maintenance responsibility.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** categorical condition rating; repair frequency per year

## 1.3 Urban development and future environment

#### 1.3.1 Planned residential development `URB_RESIDENTIAL_PROJECTS`

- **Question:** How many new residential projects are planned around the property?
- **Original wording:** Are new residential projects planned around the property?
- **Guidance:** Identify approved, permitted, under-construction, and merely proposed projects. Assess likely changes in population density, traffic, views, and service demand.
- **Answer:** Number · unit `pcs`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** number of projects; planned units; distance in metres; expected completion year

#### 1.3.2 Planned commercial and industrial development `URB_COMMERCIAL_IMPACT`

- **Question:** How would planned commercial or industrial uses change the area’s residential suitability?
- **Original wording:** Could planned commercial or industrial uses improve or reduce the area’s residential suitability?
- **Guidance:** Identify land-use designation, project scale, operating hours, emissions, traffic, and delivery routes.
- **Answer:** Single choice
- **Options:** `major_gain` Clear improvement · `minor_gain` Slight improvement · `neutral` No material change · `minor_harm` Slight harm · `major_harm` Serious harm
- **Better:** first option best
- **Method:** Document review (`documents`)
- **Source measures:** metres; floor area in m²; operating hours; traffic volume where available

#### 1.3.3 Future density and building height `URB_DENSER`

- **Question:** Is the surrounding area likely to become materially denser?
- **Guidance:** Review zoning, approved plans, plot coverage, permitted height, and nearby development rights.
- **Answer:** Yes / no
- **Better:** no
- **Method:** Document review (`documents`)
- **Source measures:** storeys; floor-area ratio; plot coverage percentage; planned dwelling units

#### 1.3.4 Road and transit projects `URB_TRANSPORT_IMPACT`

- **Question:** How would planned road or transit projects change accessibility and disturbance?
- **Original wording:** Could planned road or transit projects materially change accessibility or disturbance?
- **Guidance:** Verify project approval, financing, construction schedule, and likely route.
- **Answer:** Single choice
- **Options:** `major_gain` Clear improvement · `minor_gain` Slight improvement · `neutral` No material change · `minor_harm` Slight harm · `major_harm` Serious harm
- **Better:** first option best
- **Method:** Document review (`documents`)
- **Source measures:** distance in metres; expected year; travel-time change in minutes where modelled

#### 1.3.5 Future school and healthcare capacity `URB_SERVICE_CAPACITY`

- **Question:** Is public-service capacity expected to keep pace with planned population growth?
- **Guidance:** Identify funded or approved schools, clinics, hospitals, and their planned capacity.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Document review (`documents`)
- **Source measures:** places or beds; distance in metres; expected opening year

#### 1.3.6 Preservation of green and public space `URB_GREEN_PROTECTED`

- **Question:** Are nearby green spaces and public areas protected from future development?
- **Original wording:** Are nearby green spaces or public areas protected from future development?
- **Guidance:** Check land ownership, designation, planning documents, and approved development rights.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** square metres; distance in metres; legal/planning status as a category

#### 1.3.7 Construction impacts `URB_CONSTRUCTION_DURATION`

- **Question:** For how many months is nearby construction expected to affect residents?
- **Original wording:** What construction activity is likely to affect residents in the coming years?
- **Guidance:** Record nearby project duration, working hours, heavy-vehicle routes, dust, noise, and access disruption.
- **Answer:** Number · unit `mo`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** metres; expected duration in months; dB(A); working hours per day

#### 1.3.8 Changes in land use `URB_LAND_USE_RISK`

- **Question:** Could surrounding plots change to a less compatible use?
- **Guidance:** Check zoning, land-use permissions, public plans, and applications for changes.
- **Answer:** Yes / no
- **Better:** no
- **Method:** Document review (`documents`)
- **Source measures:** distance in metres; plot area in m²; planning status

#### 1.3.9 Long-term area investment `URB_AREA_INVESTMENT`

- **Question:** Is there verifiable evidence of sustained public or private investment in the area?
- **Guidance:** Identify completed and funded infrastructure projects, not only announcements. Compare investment with maintenance liabilities and new service demand.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** local currency; project count; project completion year

#### 1.3.10 Future view, daylight, and privacy obstruction `URB_VIEW_OBSTRUCTION`

- **Question:** Could planned development obstruct the apartment’s view, daylight, or privacy?
- **Guidance:** Identify developable plots and likely building envelopes.
- **Answer:** Yes / no
- **Better:** no
- **Method:** Document review (`documents`)
- **Source measures:** distance in metres; proposed height in storeys or metres; estimated daylight hours

## 1.4 Apartment characteristics

#### 1.4.1 Total and usable area `APT_USABLE_AREA`

- **Question:** What is the apartment’s independently measured usable floor area?
- **Original wording:** Does the apartment provide sufficient total and usable floor area?
- **Guidance:** Compare advertised, registered, and independently measured areas. Distinguish internal usable area from balconies, terraces, and shared areas.
- **Answer:** Number · unit `m²`
- **Better:** target
- **Method:** Instrumental measurement (`measurement`)
- **Source measures:** m²; difference in m² and percentage

#### 1.4.2 Bedroom count and dimensions `APT_BEDROOMS`

- **Question:** How many bedrooms does the apartment have?
- **Original wording:** Are the number and dimensions of bedrooms suitable for the household?
- **Guidance:** Record each bedroom’s area, width, length, window position, and furniture usability.
- **Answer:** Number · unit `pcs`
- **Better:** target
- **Method:** Visual inspection (`visual`)
- **Source measures:** number of bedrooms; m²; metres

#### 1.4.3 Living and dining area `APT_LIVING_AREA`

- **Question:** What is the usable area of the living and dining space?
- **Original wording:** Is the living/dining area adequate for household use?
- **Guidance:** Assess usable dimensions, furniture layout, circulation, and separation from noisy areas.
- **Answer:** Number · unit `m²`
- **Better:** higher
- **Method:** Instrumental measurement (`measurement`)
- **Source measures:** m²; metres

#### 1.4.4 Kitchen functionality `APT_KITCHEN`

- **Question:** Is the kitchen suitable for the household’s cooking and dining needs?
- **Guidance:** Assess worktop length, storage, ventilation, appliance positions, and dining capacity.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** m²; metres; number of usable worktop metres

#### 1.4.5 Bathroom and toilet provision `APT_BATHROOMS`

- **Question:** Are the number, location, and dimensions of bathrooms and toilets adequate?
- **Guidance:** Check fixture condition, ventilation, access, and whether facilities can be used simultaneously.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** number; m²; metres

#### 1.4.6 Storage `APT_STORAGE`

- **Question:** Is sufficient practical storage provided?
- **Guidance:** Assess wardrobes, pantry, utility storage, and separate storage rooms.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** m²; linear metres of storage; number of storage spaces

#### 1.4.7 Circulation and wasted space `APT_WASTED_AREA`

- **Question:** What share of the total area is circulation or unusable space?
- **Original wording:** Is the layout efficient, with limited unusable circulation space?
- **Guidance:** Measure corridors and areas that cannot be furnished or used effectively.
- **Answer:** Number · unit `%`
- **Better:** lower
- **Method:** Calculation (`calculation`)
- **Source measures:** m²; percentage of total area

#### 1.4.8 Room separation and privacy `APT_ROOM_SEPARATION`

- **Question:** The layout gives suitable separation between private, shared, and work areas.
- **Original wording:** Does the layout provide suitable separation between private, shared, and work areas?
- **Guidance:** Assess bedroom access, through-rooms, noise transfer, and household privacy.
- **Answer:** Rating on a scale · scale `agreement_5`
- **Better:** higher
- **Method:** Expert judgement (`expert`)
- **Source measures:** categorical layout assessment; number of through-rooms

#### 1.4.9 Natural light `APT_DAYLIGHT`

- **Question:** Do the principal rooms receive adequate natural daylight?
- **Guidance:** Inspect at different times of day and consider orientation and external obstruction.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** daylight hours; lux where measured; window-to-floor ratio

#### 1.4.10 Ventilation `APT_VENTILATION`

- **Question:** Can rooms be adequately ventilated?
- **Guidance:** Check opening windows, cross-ventilation, extract systems, and signs of stale air or condensation.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** air changes per hour (ACH) where measured; m³/h; categorical inspection

#### 1.4.11 Orientation and solar exposure `APT_ORIENTATION`

- **Question:** Is the apartment orientation suitable for comfort and energy use?
- **Guidance:** Record orientation of each principal room and seasonal solar exposure.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** compass bearing in degrees; hours of direct sunlight

#### 1.4.12 Balcony, loggia, or terrace `APT_OUTDOOR_SPACE`

- **Question:** Is outdoor private space useful, safe, and legally documented?
- **Guidance:** Measure area and inspect drainage, enclosure, waterproofing, and structural alterations.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** m²; metres; documentary status

#### 1.4.13 Adaptability `APT_ADAPTABILITY`

- **Question:** The apartment can adapt to foreseeable household changes.
- **Original wording:** Can the apartment adapt to foreseeable household changes?
- **Guidance:** Consider remote work, children, older household members, accessibility, and possible room reconfiguration.
- **Answer:** Rating on a scale · scale `agreement_5`
- **Better:** higher
- **Method:** Expert judgement (`expert`)
- **Source measures:** number of feasible layout options; cost in local currency for required adaptations

#### 1.4.14 Furniture and appliance fit `APT_FURNITURE_FIT`

- **Question:** Can essential furniture and appliances fit without obstructing circulation?
- **Guidance:** Test actual dimensions of beds, wardrobes, refrigerator, washing machine, and workstations.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Instrumental measurement (`measurement`)
- **Source measures:** metres; m²; number of fitting constraints

#### 1.4.15 Work-from-home suitability `APT_WORK_FROM_HOME`

- **Question:** There is a practical space for quiet work or study.
- **Original wording:** Is there a practical space for quiet work or study?
- **Guidance:** Assess room separation, daylight, power, connectivity, and acoustic privacy.
- **Answer:** Rating on a scale · scale `agreement_5`
- **Better:** higher
- **Method:** Expert judgement (`expert`)
- **Source measures:** m²; Mbps; dB(A) where measured

## 1.5 Building characteristics

#### 1.5.1 Construction type and documentation `BLD_CONSTRUCTION_TYPE`

- **Question:** What is the building’s construction system?
- **Original wording:** Is the building’s construction system known and consistent with its technical documentation?
- **Guidance:** Identify structural system, materials, design documentation, and any later modifications.
- **Answer:** Single choice
- **Options:** `rc_frame` Reinforced concrete frame · `brick` Load-bearing brick · `panel` Large panel · `mixed` Mixed or other
- **Better:** depends on your view of each system
- **Method:** Document review (`documents`)
- **Source measures:** categorical construction type; document reference

#### 1.5.2 Building scale and density `BLD_APARTMENTS`

- **Question:** How many apartments does the building have?
- **Original wording:** Is the building’s size and density compatible with adequate access and shared services?
- **Guidance:** Record storeys, entrances, apartments, and occupants where known.
- **Answer:** Number · unit `pcs`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** storeys; entrances; apartments; estimated residents

#### 1.5.3 Entrance capacity `BLD_APTS_PER_ENTRANCE`

- **Question:** How many apartments share one entrance?
- **Original wording:** Is the number of apartments per entrance manageable?
- **Guidance:** Assess entrance traffic, lift demand, stair capacity, and common-area wear.
- **Answer:** Number · unit `pcs`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** apartments per entrance; apartments per lift

#### 1.5.4 Elevator provision `BLD_ELEVATORS`

- **Question:** Are there sufficient and reliable elevators for the building?
- **Guidance:** Record number, rated capacity, service condition, accessibility, and outage history.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** number; persons or kg per lift; outages per year; repair duration in hours

#### 1.5.5 Common-area design `BLD_COMMON_AREAS`

- **Question:** Are common areas functional, accessible, and appropriately sized?
- **Guidance:** Inspect entrance, corridors, stairs, bicycle/pram storage, and shared rooms.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** m²; metres; categorical condition

#### 1.5.6 Accessibility of the building `BLD_ACCESSIBILITY`

- **Question:** Does the building provide practical access for people with limited mobility?
- **Guidance:** Check entrance steps, ramps, lift access, door widths, and routes to shared facilities.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** millimetres; number of steps; ramp gradient

#### 1.5.7 Parking and vehicle storage `BLD_PARKING`

- **Question:** Is the building’s parking provision adequate and legally usable?
- **Guidance:** Record total spaces, allocation, access, security, and electric-vehicle provision if relevant.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** spaces; spaces per apartment; m²; monthly cost

#### 1.5.8 Fire safety `BLD_FIRE_SAFETY`

- **Question:** Are fire-safety systems and evacuation routes adequate and maintained?
- **Guidance:** Check exits, stairs, alarms, extinguishers, smoke control, signage, and access routes.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** number of exits; inspection date; categorical compliance status
- **Knock-out candidate**

#### 1.5.9 Building management `BLD_MANAGEMENT`

- **Question:** Is there a clear and competent building-management arrangement?
- **Guidance:** Identify responsible entity, service scope, contact process, financial transparency, and complaint handling.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Document review (`documents`)
- **Source measures:** local currency per m² per month; response time in hours or days; documentary status

#### 1.5.10 Maintenance planning `BLD_MAINTENANCE_PLAN`

- **Question:** Is there a documented plan for routine and major maintenance?
- **Guidance:** Review maintenance schedule, budget, responsible parties, and completed work.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** local currency per year; maintenance tasks per year; plan period in years

## 1.6 Environmental quality

#### 1.6.1 Outdoor air quality `ENV_PM25`

- **Question:** What is the average PM2.5 concentration near the property?
- **Original wording:** Is outdoor air quality acceptable for residential use?
- **Guidance:** Review credible monitoring data and identify nearby pollution sources. Compare seasonal conditions where data exists.
- **Answer:** Number · unit `µg/m³`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** PM2.5 and PM10 in µg/m³; NO₂, SO₂, and ozone in µg/m³ or ppb

#### 1.6.2 Road and traffic noise `ENV_TRAFFIC_NOISE`

- **Question:** What traffic noise level is measured in the main rooms?
- **Original wording:** Does traffic create excessive noise inside or around the apartment?
- **Guidance:** Measure or document noise at relevant rooms and times.
- **Answer:** Number · unit `dB(A)`
- **Better:** lower
- **Method:** Instrumental measurement (`measurement`)
- **Source measures:** dB(A), preferably LAeq over a stated measurement period

#### 1.6.3 Industrial, railway, airport, and construction noise `ENV_OTHER_NOISE`

- **Question:** What noise level is measured from other recurring sources?
- **Original wording:** Are there other recurring noise sources that affect residential comfort?
- **Guidance:** Identify source, operating hours, frequency, and seasonal variation.
- **Answer:** Number · unit `dB(A)`
- **Better:** lower
- **Method:** Instrumental measurement (`measurement`)
- **Source measures:** dB(A); events per day or week; metres to source

#### 1.6.4 Wind and exposure `ENV_WIND`

- **Question:** Does local wind exposure create discomfort or safety concerns?
- **Guidance:** Assess wind corridors, entrance exposure, balconies, and surrounding building effects.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Expert judgement (`expert`)
- **Source measures:** m/s; direction in degrees; number of observed high-wind events

#### 1.6.5 Flooding and waterlogging `ENV_FLOOD_INCIDENTS`

- **Question:** How many flooding or waterlogging incidents happen per year?
- **Original wording:** Is the property exposed to surface flooding, groundwater, or waterlogging?
- **Guidance:** Review flood history, topography, drainage, and nearby watercourses.
- **Answer:** Number · unit `pcs`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** incidents per year; flood depth in cm; groundwater depth in metres

#### 1.6.6 Geological and seismic hazards `ENV_GEO_HAZARD`

- **Question:** What level of geological, soil, slope, or seismic hazard is documented for the site?
- **Original wording:** Are geological, soil, slope, or seismic hazards documented for the site?
- **Guidance:** Review geotechnical and hazard reports, official maps, and relevant engineering assessments.
- **Answer:** Single choice
- **Options:** `none` No identified risk · `low` Low · `moderate` Moderate · `high` High
- **Better:** first option best
- **Method:** Expert judgement (`expert`)
- **Source measures:** hazard category; soil parameters as reported; seismic design intensity or acceleration in the applicable standard

#### 1.6.7 Odors and emissions `ENV_ODORS`

- **Question:** How often do odors, fumes, or emissions reach the property?
- **Original wording:** Are there recurring odors, fumes, or emissions from nearby activities?
- **Guidance:** Identify source, frequency, direction, and time of occurrence.
- **Answer:** Rating on a scale · scale `frequency_5`
- **Better:** lower
- **Method:** Visual inspection (`visual`)
- **Source measures:** events per week; metres to source; pollutant concentration where measured

#### 1.6.8 Greenery and outdoor comfort `ENV_OUTDOOR_COMFORT`

- **Question:** Does the immediate environment provide comfortable outdoor conditions?
- **Guidance:** Assess shade, heat exposure, planting, and usable outdoor areas.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** percentage canopy cover; °C; m² of usable green space

#### 1.6.9 Privacy and overlooking `ENV_OVERLOOKING`

- **Question:** Is the apartment exposed to unreasonable overlooking from nearby buildings or public areas?
- **Guidance:** Assess window-to-window distances, sightlines, and balcony exposure.
- **Answer:** Yes / no
- **Better:** no
- **Method:** Visual inspection (`visual`)
- **Source measures:** metres; number of directly facing windows or balconies

#### 1.6.10 Indoor environmental quality `ENV_INDOOR_QUALITY`

- **Question:** Are indoor temperature, humidity, ventilation, and pollutant conditions acceptable?
- **Guidance:** Measure representative rooms and identify mold, condensation, or combustion risks.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Instrumental measurement (`measurement`)
- **Source measures:** °C; relative humidity percentage; CO₂ in ppm; relevant pollutant concentration

## 1.7 Financial attractiveness

#### 1.7.1 Asking price and price per square metre `FIN_PRICE_VS_MARKET`

- **Question:** By what percentage does the asking price per m² differ from the comparable median?
- **Original wording:** Is the asking price reasonable against relevant comparable properties?
- **Guidance:** Compare properties with similar location, condition, building type, floor, size, and legal status. Use completed transaction evidence where available; distinguish asking prices from actual sale prices.
- **Answer:** Number · unit `%`
- **Better:** lower
- **Method:** Calculation (`calculation`)
- **Source measures:** local currency; local currency/m²; percentage difference from comparable median

#### 1.7.2 Total acquisition cost `FIN_TOTAL_COST`

- **Question:** What is the full cost to acquire the apartment and make it usable?
- **Original wording:** What is the full cost required to acquire and make the apartment usable?
- **Guidance:** Include purchase price, taxes, registration, legal services, financing fees, repairs, furnishing, and moving costs.
- **Answer:** Number · unit `cur`
- **Better:** lower
- **Method:** Calculation (`calculation`)
- **Source measures:** local currency; percentage of purchase price

#### 1.7.3 Renovation and fit-out budget `FIN_RENOVATION`

- **Question:** What renovation and fit-out spending per m² is needed before occupation or rental?
- **Original wording:** What expenditure is required before occupation or rental?
- **Guidance:** Separate essential repairs, optional improvements, and contingency. Obtain itemized estimates and identify assumptions.
- **Answer:** Number · unit `cur/m²`
- **Better:** lower
- **Method:** Calculation (`calculation`)
- **Source measures:** local currency; local currency/m²; contingency percentage

#### 1.7.4 Furniture and equipment costs `FIN_FURNISHING`

- **Question:** What is the cost of furnishing and equipping the apartment?
- **Original wording:** What is the cost of furnishing and equipping the apartment?
- **Guidance:** Estimate essential furniture, appliances, lighting, and fixtures.
- **Answer:** Number · unit `cur`
- **Better:** lower
- **Method:** Calculation (`calculation`)
- **Source measures:** local currency; local currency/m²

#### 1.7.5 Recurring utility costs `FIN_UTILITIES`

- **Question:** What are the expected utility expenses per month?
- **Original wording:** What are the expected recurring utility expenses?
- **Guidance:** Collect actual bills or tariffs for electricity, water, heating, gas, waste, and internet. Adjust for household size and seasonal variation.
- **Answer:** Number · unit `cur/mo`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** local currency/month; kWh/month; m³/month; Gcal/month where applicable

#### 1.7.6 Building maintenance charges `FIN_MANAGEMENT_CHARGE`

- **Question:** What building-management and maintenance charge will the owner pay per m² per month?
- **Original wording:** What recurring building-management and maintenance charges will the owner pay?
- **Guidance:** Confirm charge basis, included services, arrears, and planned increases.
- **Answer:** Number · unit `cur/m²/mo`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** local currency/month; local currency/m²/month; annual percentage increase

#### 1.7.7 Financing affordability `FIN_DEBT_TO_INCOME`

- **Question:** What share of stable household income goes to debt service?
- **Original wording:** Is the acquisition affordable under realistic financing assumptions?
- **Guidance:** Calculate deposit, principal, interest, repayment, fees, and sensitivity to rate or income changes. Compare monthly housing costs with stable household income.
- **Answer:** Number · unit `%`
- **Better:** lower
- **Method:** Calculation (`calculation`)
- **Source measures:** local currency/month; interest rate percentage; debt-service-to-income percentage

#### 1.7.8 Rental potential `FIN_RENT`

- **Question:** What rent could the apartment realistically achieve per month?
- **Original wording:** What rent could the apartment realistically achieve?
- **Guidance:** Compare completed rental agreements or well-supported market evidence for similar units. Adjust for furnishing, condition, location, and vacancy.
- **Answer:** Number · unit `cur/mo`
- **Better:** higher
- **Method:** Document review (`documents`)
- **Source measures:** local currency/month; local currency/m²/month

#### 1.7.9 Gross rental yield `FIN_GROSS_YIELD`

- **Question:** What is the gross rental yield per year, based on realistic rent?
- **Original wording:** What is the gross rental yield based on realistic rent?
- **Guidance:** Calculate annual gross rent divided by total acquisition price or total acquisition cost; state the denominator used.
- **Answer:** Number · unit `%`
- **Better:** higher
- **Method:** Calculation (`calculation`)
- **Source measures:** percentage per year

#### 1.7.10 Net rental yield `FIN_NET_YIELD`

- **Question:** What is the net rental yield per year after ownership and operating costs?
- **Original wording:** What is the net rental yield after recurring ownership and operating costs?
- **Guidance:** Deduct vacancy, maintenance, management, taxes, insurance, and other owner-paid expenses. State whether financing costs are included.
- **Answer:** Number · unit `%`
- **Better:** higher
- **Method:** Calculation (`calculation`)
- **Source measures:** percentage per year; local currency/year

#### 1.7.11 Total cost of ownership `FIN_TCO`

- **Question:** What is the total cost of ownership over the selected holding period?
- **Original wording:** What is the projected total cost of ownership over the selected holding period?
- **Guidance:** Include acquisition, financing, maintenance, utilities, insurance, taxes, repairs, and eventual disposal costs. Use explicit inflation, utility-price, and maintenance assumptions.
- **Answer:** Number · unit `cur`
- **Better:** lower
- **Method:** Calculation (`calculation`)
- **Source measures:** local currency over 5, 10, or 15 years; present value in local currency

#### 1.7.12 Capital preservation `FIN_STRESS_DECLINE`

- **Question:** By what percentage would real value fall under a plausible adverse scenario?
- **Original wording:** How resilient is the apartment’s value under plausible adverse market scenarios?
- **Guidance:** Stress-test price decline, inflation, currency changes, repair costs, and reduced buyer demand. Distinguish nominal value from inflation-adjusted value.
- **Answer:** Number · unit `%`
- **Better:** lower
- **Method:** Calculation (`calculation`)
- **Source measures:** percentage change; local currency; real annual return percentage

#### 1.7.13 Appreciation assumptions `FIN_APPRECIATION`

- **Question:** What annual price growth is supported by observed market evidence?
- **Original wording:** Is expected price appreciation supported by observable market evidence?
- **Guidance:** Separate historical market performance from forecasts. Identify the source, time period, sample, and inflation adjustment.
- **Answer:** Number · unit `%`
- **Better:** higher
- **Method:** Document review (`documents`)
- **Source measures:** annual percentage; local currency/m²; observation period in years

#### 1.7.14 Opportunity cost `FIN_RETURN_VS_ALTERNATIVE`

- **Question:** By how many percentage points per year does the expected return beat the best realistic alternative?
- **Original wording:** How does the expected outcome compare with realistic alternative uses of the capital?
- **Guidance:** Compare ownership with renting and investing the same capital elsewhere. Include transaction costs, liquidity, risk, and tax assumptions.
- **Answer:** Number · unit `%`
- **Better:** higher
- **Method:** Calculation (`calculation`)
- **Source measures:** annualized return percentage; local currency; holding period in years

## 1.8 Market liquidity and resale potential

#### 1.8.1 Buyer demand `MKT_SALES_COUNT`

- **Question:** How many comparable apartments are sold per year?
- **Original wording:** Is there demonstrable buyer demand for apartments of this type and location?
- **Guidance:** Review transaction counts, active listings, and time-to-sale for comparable units.
- **Answer:** Number · unit `pcs`
- **Better:** higher
- **Method:** Document review (`documents`)
- **Source measures:** completed transactions per month or year; days on market

#### 1.8.2 Rental demand `MKT_VACANCY`

- **Question:** What is the vacancy rate of comparable rentals?
- **Original wording:** Is there demonstrable rental demand for this apartment type?
- **Guidance:** Review comparable rental listings and completed rentals, vacancy, and tenant profile.
- **Answer:** Number · unit `%`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** rental transactions per month or year; vacancy percentage; days to let

#### 1.8.3 Competing supply `MKT_COMPETING_SUPPLY`

- **Question:** How many comparable units compete with the property?
- **Original wording:** How much comparable supply competes with the property?
- **Guidance:** Count active listings and planned or newly completed competing units.
- **Answer:** Number · unit `pcs`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** number of units; percentage of comparable stock; distance in kilometres

#### 1.8.4 Time on market `MKT_DAYS_ON_MARKET`

- **Question:** What is the median time for comparable apartments to sell or rent?
- **Original wording:** How long do comparable apartments typically take to sell or rent?
- **Guidance:** Use a defined sample and distinguish listing duration from verified transaction time.
- **Answer:** Number · unit `day`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** median days; 25th and 75th percentile days

#### 1.8.5 Negotiation discount `MKT_NEGOTIATION_DISCOUNT`

- **Question:** What discount from asking price is typical for comparable transactions?
- **Original wording:** What discount from asking price is typical for comparable transactions?
- **Guidance:** Compare original asking price with final transaction price where evidence exists.
- **Answer:** Number · unit `%`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** percentage; local currency/m²

#### 1.8.6 Configuration appeal `MKT_CONFIG_APPEAL`

- **Question:** Does the apartment’s size, layout, and bedroom count appeal to a broad buyer or tenant group?
- **Guidance:** Compare the unit with the most frequently transacted configurations in the target market.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Expert judgement (`expert`)
- **Source measures:** m²; number of bedrooms; share of comparable transactions

#### 1.8.7 Building reputation `MKT_BUILDING_REPUTATION`

- **Question:** Does the building have a demonstrable reputation that affects demand?
- **Guidance:** Review maintenance, defects, management, resident feedback, and resale evidence.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Expert judgement (`expert`)
- **Source measures:** categorical evidence assessment; price difference percentage where supported

#### 1.8.8 Location liquidity `MKT_LOCATION_TURNOVER`

- **Question:** What share of apartments in the location changes hands per year?
- **Original wording:** Does the location have sustained transaction activity across market conditions?
- **Guidance:** Compare turnover and price resilience with other areas.
- **Answer:** Number · unit `%`
- **Better:** higher
- **Method:** Document review (`documents`)
- **Source measures:** transactions per year; turnover percentage; annual price change percentage

#### 1.8.9 Alternative supply and substitution `MKT_SUBSTITUTES`

- **Question:** How many close substitute properties are available nearby?
- **Original wording:** Can buyers or tenants easily substitute another nearby property?
- **Guidance:** Identify comparable alternatives by price, transport, building quality, and availability.
- **Answer:** Number · unit `pcs`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** number of close substitutes; distance in kilometres; price difference percentage

#### 1.8.10 Demand fundamentals `MKT_DEMAND_FUNDAMENTALS`

- **Question:** Are local demographic and economic conditions supportive of long-term housing demand?
- **Guidance:** Review population, employment, household formation, migration, and income trends using reliable data.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Expert judgement (`expert`)
- **Source measures:** annual population change percentage; employment; household growth percentage; income in local currency

---

# Part II: Existing property

82 questions. Top-level category: **Existing property**. Sections, which are its subcategories:

- 2.1 Structural integrity and physical condition (8)
- 2.2 Building envelope and insulation (8)
- 2.3 Engineering systems and utilities (12)
- 2.4 Common areas and building management (10)
- 2.5 Maintenance history and future capital expenditure (10)
- 2.6 Apartment-specific physical inspection (12)
- 2.7 Legal ownership and transaction due diligence (12)
- 2.8 Apartment position within the building (10)

## 2.1 Structural integrity and physical condition

#### 2.1.1 Foundation and settlement `EX_STR_FOUNDATION_MOVEMENT`

- **Question:** Is there evidence of foundation movement or differential settlement?
- **Guidance:** Inspect accessible foundation areas and basement; review structural reports and repair history. Look for recurring cracks, uneven floors, and distortion around openings.
- **Answer:** Yes / no
- **Better:** no
- **Method:** Visual inspection (`visual`)
- **Source measures:** crack width in mm; settlement in mm; categorical engineer assessment

#### 2.1.2 Structural cracks and deformation `EX_STR_CRACK_WIDTH`

- **Question:** What is the width of the widest crack that may indicate structural distress?
- **Original wording:** Are there cracks or deformations that may indicate structural distress?
- **Guidance:** Record location, direction, width, length, and whether cracks are active. Obtain assessment by a qualified structural engineer for potentially significant defects.
- **Answer:** Number · unit `mm`
- **Better:** lower
- **Method:** Instrumental measurement (`measurement`)
- **Source measures:** crack width in mm; length in m; change over time in mm
- **Knock-out candidate**

#### 2.1.3 Unauthorized structural alterations `EX_STR_ALTERATIONS`

- **Question:** Have load-bearing walls, columns, beams, slabs, or other structural elements been altered?
- **Guidance:** Compare current condition with approved plans and technical records. Identify removed openings, penetrations, extensions, or added loads.
- **Answer:** Yes / no
- **Better:** no
- **Method:** Document review (`documents`)
- **Source measures:** number and location of alterations; documentary status
- **Knock-out candidate**

#### 2.1.4 Seismic performance and assessment `EX_STR_SEISMIC`

- **Question:** What does a current, credible assessment conclude about the building’s seismic condition?
- **Original wording:** Is there a current, credible assessment of the building’s seismic condition?
- **Guidance:** Review original design basis, later strengthening, inspections, and applicable local seismic requirements. Do not infer seismic safety from building age or construction label alone.
- **Answer:** Single choice
- **Options:** `meets` Meets current requirements · `minor` Minor strengthening needed · `major` Major strengthening needed · `unsafe` Unsafe
- **Better:** first option best
- **Method:** Expert judgement (`expert`)
- **Source measures:** engineer’s categorical conclusion; applicable seismic intensity or acceleration; report date
- **Knock-out candidate**

#### 2.1.5 Age and condition context `EX_STR_AGE_CONDITION`

- **Question:** How consistent is the building’s observed condition and maintenance history with its age?
- **Original wording:** Is the building’s age consistent with its observed condition and maintenance history?
- **Guidance:** Record construction year, major renovations, and component replacement dates. Assess age together with maintenance and exposure, not as a stand-alone score.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** years; year of last major repair

#### 2.1.6 Major structural repairs `EX_STR_MAJOR_REPAIRS`

- **Question:** Have major structural repairs or strengthening works been performed?
- **Guidance:** Obtain scope, permits/approvals where required, contractor details, completion records, and engineering sign-off.
- **Answer:** Yes / no
- **Better:** depends on why they were needed
- **Method:** Document review (`documents`)
- **Source measures:** year; local currency; number of repaired elements; documentary status

#### 2.1.7 Remaining useful life `EX_STR_REMAINING_LIFE`

- **Question:** How many years of useful life has a professional assessed for the building?
- **Original wording:** What remaining useful life has been professionally assessed for the building and its major components?
- **Guidance:** Obtain a condition survey and component-specific remaining-life estimates. Identify assumptions, exclusions, and required near-term interventions.
- **Answer:** Number · unit `yr`
- **Better:** higher
- **Method:** Expert judgement (`expert`)
- **Source measures:** years; condition grade; estimated replacement year

#### 2.1.8 Structural inspection coverage `EX_STR_INSPECTED`

- **Question:** Has an independent structural inspection covered the relevant building elements?
- **Guidance:** Confirm inspector qualifications, inspection date, access limitations, tests, and report conclusions.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** inspection date; percentage of accessible/inspected elements; number of tests

## 2.2 Building envelope and insulation

#### 2.2.1 Facade condition `EX_ENV_FACADE_DAMAGE`

- **Question:** What percentage of the facade shows material deterioration?
- **Original wording:** Is the facade intact and free from material deterioration?
- **Guidance:** Inspect cracks, loose finishes, corrosion, water ingress, and unsafe elements. Review facade repair history.
- **Answer:** Number · unit `%`
- **Better:** lower
- **Method:** Visual inspection (`visual`)
- **Source measures:** percentage of facade affected; crack width in mm; repair cost in local currency

#### 2.2.2 Thermal insulation `EX_ENV_WALL_U_VALUE`

- **Question:** What is the U-value of the external walls?
- **Original wording:** Does the external envelope provide adequate thermal insulation?
- **Guidance:** Review design or retrofit documentation and measured thermal performance where available. Identify insulation type, thickness, continuity, and condition.
- **Answer:** Number · unit `W/(m²·K)`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** insulation thickness in mm; U-value in W/(m²·K); thermal resistance in m²·K/W

#### 2.2.3 Roof and waterproofing `EX_ENV_ROOF`

- **Question:** Is the roof waterproof and properly maintained?
- **Guidance:** Inspect accessible roof areas, drainage, membrane condition, ponding, and repair records.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** roof area in m²; leak incidents per year; year of last repair

#### 2.2.4 Basement and below-ground moisture `EX_ENV_BASEMENT_DRY`

- **Question:** Are basement and below-ground areas free from persistent moisture or water ingress?
- **Guidance:** Inspect walls, floors, drainage, ventilation, odor, and water marks.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Visual inspection (`visual`)
- **Source measures:** relative humidity percentage; moisture meter reading; water depth in cm; incidents per year

#### 2.2.5 Thermal bridges, condensation, and mold `EX_ENV_MOLD`

- **Question:** Are there thermal bridges, condensation, or mold problems in the building?
- **Guidance:** Inspect corners, window reveals, external walls, and concealed areas where accessible. Record recurrence and previous remediation.
- **Answer:** Yes / no
- **Better:** no
- **Method:** Visual inspection (`visual`)
- **Source measures:** surface temperature in °C; relative humidity percentage; affected area in m²

#### 2.2.6 Common-area windows and doors `EX_ENV_COMMON_WINDOWS`

- **Question:** Are common-area windows and external doors weather-tight and functional?
- **Guidance:** Inspect seals, frames, glazing, locks, and damage.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** number of defective units; repair cost in local currency

#### 2.2.7 Balconies and external projections `EX_ENV_BALCONIES`

- **Question:** Are balconies and external projections structurally sound and weather-protected?
- **Guidance:** Inspect slab edges, railings, drainage, waterproofing, and unauthorized enclosures.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** crack width in mm; railing height in mm; number of defects

#### 2.2.8 Rainwater drainage `EX_ENV_RAINWATER`

- **Question:** Does the building’s rainwater drainage work without leaks or uncontrolled discharge?
- **Guidance:** Inspect gutters, downpipes, roof outlets, and discharge points.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** number of blockages/leaks per year; pipe diameter in mm

## 2.3 Engineering systems and utilities

#### 2.3.1 Heating system `EX_ENG_HEATING`

- **Question:** Does the heating system provide reliable and controllable heat?
- **Guidance:** Identify central, individual, or mixed heating; inspect distribution and controls. Review winter complaints and outages.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** indoor temperature in °C; interruptions per heating season; energy use in kWh or Gcal

#### 2.3.2 Water supply and pressure `EX_ENG_WATER_PRESSURE`

- **Question:** What water pressure is measured at the fixtures?
- **Original wording:** Is water supply reliable and pressure adequate at relevant fixtures?
- **Guidance:** Test at different times and floors where possible. Review interruptions and pressure complaints.
- **Answer:** Number · unit `bar`
- **Better:** target
- **Method:** Instrumental measurement (`measurement`)
- **Source measures:** pressure in bar or kPa; interruptions per month; flow in L/min

#### 2.3.3 Hot water `EX_ENG_HOT_WATER_TEMP`

- **Question:** What hot water temperature is measured at the fixtures?
- **Original wording:** Is hot water reliably available at the required temperature?
- **Guidance:** Measure temperature and waiting time; identify central or individual production.
- **Answer:** Number · unit `°C`
- **Better:** target
- **Method:** Instrumental measurement (`measurement`)
- **Source measures:** °C; seconds to reach temperature; interruptions per month

#### 2.3.4 Plumbing and risers `EX_ENG_RISERS`

- **Question:** Are internal pipes, risers, valves, and connections in acceptable condition?
- **Guidance:** Identify pipe materials, age, corrosion, leakage, and replacement history.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** years; number of leaks per year; pipe diameter in mm; replacement cost in local currency

#### 2.3.5 Sewerage `EX_ENG_SEWERAGE`

- **Question:** Does the sewerage system drain correctly without recurring blockage or odor?
- **Guidance:** Test fixtures and inspect accessible pipes and cleanouts. Review blockage history.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** blockages per year; drainage time in seconds; repair cost in local currency

#### 2.3.6 Electrical capacity `EX_ENG_ELECTRICAL_CAPACITY`

- **Question:** What electrical capacity is available to the apartment?
- **Original wording:** Is the electrical installation adequate for modern household loads?
- **Guidance:** Check supply capacity, circuit layout, protective devices, wiring condition, and upgrade feasibility.
- **Answer:** Number · unit `kW`
- **Better:** higher
- **Method:** Document review (`documents`)
- **Source measures:** kW; amperes; volts; number of circuits

#### 2.3.7 Electrical safety and grounding `EX_ENG_ELECTRICAL_SAFETY`

- **Question:** Are grounding, residual-current protection, and electrical safety measures present and functional?
- **Guidance:** Obtain inspection by a qualified electrician; review test results.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Expert judgement (`expert`)
- **Source measures:** ohms; milliamperes; inspection date; categorical compliance status

#### 2.3.8 Ventilation system `EX_ENG_VENTILATION`

- **Question:** Does ventilation operate effectively in apartments and common areas?
- **Guidance:** Check extraction in kitchens and bathrooms, air paths, blockages, and backdraft.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** m³/h; air changes per hour; CO₂ in ppm where relevant

#### 2.3.9 Gas installation `EX_ENG_GAS_SAFE`

- **Question:** Is the gas installation safe, maintained, and properly documented?
- **Guidance:** Inspect appliances, ventilation, shut-off valves, detectors, and service records.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Expert judgement (`expert`)
- **Source measures:** inspection date; gas concentration in ppm where tested; number of defects

#### 2.3.10 Utility interruptions `EX_ENG_INTERRUPTIONS`

- **Question:** How many unplanned interruptions to essential utilities happen per year?
- **Original wording:** How frequent and prolonged are interruptions to essential utilities?
- **Guidance:** Collect resident/management records and provider notices. Separate planned maintenance from unplanned failures.
- **Answer:** Number · unit `pcs`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** interruptions per month or year; hours per incident

#### 2.3.11 Backup systems `EX_ENG_BACKUP`

- **Question:** Are backup systems available for essential building services?
- **Guidance:** Identify backup power, pumps, water storage, heating, and their tested capacity.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** kW; litres; hours of autonomy; test frequency per year

#### 2.3.12 Engineering documentation `EX_ENG_DOCUMENTS`

- **Question:** What percentage of the required engineering documents is available and current?
- **Original wording:** Are current engineering-system drawings, inspection records, and maintenance documents available?
- **Guidance:** Check completeness, date, responsible party, and consistency with installed systems.
- **Answer:** Number · unit `%`
- **Better:** higher
- **Method:** Document review (`documents`)
- **Source measures:** percentage of required documents available; latest review date

## 2.4 Common areas and building management

#### 2.4.1 Entrance condition `EX_COM_ENTRANCE`

- **Question:** Is the entrance clean, secure, weather-protected, and maintained?
- **Guidance:** Inspect doors, locks, lighting, finishes, and accessibility.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** categorical condition; number of defects

#### 2.4.2 Elevator operation `EX_COM_ELEVATOR_DOWNTIME`

- **Question:** How many hours per month are elevators out of service?
- **Original wording:** Are elevators maintained and operational with acceptable downtime?
- **Guidance:** Review service contracts, inspections, breakdowns, and repair times.
- **Answer:** Number · unit `h`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** downtime hours per month; failures per year; rated capacity in kg or persons

#### 2.4.3 Staircases and corridors `EX_COM_STAIRS`

- **Question:** Are staircases and corridors safe, clean, and unobstructed?
- **Guidance:** Check lighting, handrails, fire doors, storage obstruction, and finishes.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** number of defects; lux; clear width in mm

#### 2.4.4 Fire protection in common areas `EX_COM_FIRE_MAINTAINED`

- **Question:** Are fire-protection systems and evacuation routes inspected and maintained?
- **Guidance:** Review alarms, extinguishers, smoke extraction, fire doors, signage, and inspection records.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** inspection date; number of non-conformities; number of blocked exits
- **Knock-out candidate**

#### 2.4.5 Cleaning and routine services `EX_COM_CLEANING`

- **Question:** Are cleaning and routine maintenance services delivered consistently?
- **Guidance:** Compare service obligations with actual condition and resident records.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** cleaning frequency per week; service response time in hours or days

#### 2.4.6 Security and access control `EX_COM_SECURITY`

- **Question:** Are access-control and security arrangements effective and properly managed?
- **Guidance:** Inspect gates, intercoms, cameras, lighting, and access policies.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** number of functioning devices; camera coverage percentage; incident count per year

#### 2.4.7 Management organization and transparency `EX_COM_TRANSPARENCY`

- **Question:** Is the building-management entity accountable and financially transparent?
- **Guidance:** Review governing documents, budgets, meeting minutes, contracts, and financial reports.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Document review (`documents`)
- **Source measures:** reporting frequency; local currency/year; document availability percentage

#### 2.4.8 Maintenance fees `EX_COM_FEES`

- **Question:** Are management and maintenance fees reasonable and supported by services?
- **Guidance:** Compare fee levels with scope, actual expenditure, and similar buildings.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Document review (`documents`)
- **Source measures:** local currency/m²/month; annual percentage change

#### 2.4.9 Resident disputes and arrears `EX_COM_DISPUTES`

- **Question:** Are there material disputes, unpaid charges, or unresolved management issues?
- **Guidance:** Review available meeting records, claims, litigation, and arrears data.
- **Answer:** Yes / no
- **Better:** no
- **Method:** Document review (`documents`)
- **Source measures:** local currency of arrears; number of disputes; age in months

#### 2.4.10 Shared-space use `EX_COM_LAWFUL_USE`

- **Question:** Are common areas used consistently with their intended and lawful purpose?
- **Guidance:** Check unauthorized storage, commercial use, blocked access, and encroachment.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Visual inspection (`visual`)
- **Source measures:** number of observed violations; area in m²

## 2.5 Maintenance history and future capital expenditure

#### 2.5.1 Roof repair history `EX_CAP_ROOF_YEARS`

- **Question:** How many years have passed since the last major roof repair?
- **Original wording:** What roof repairs have been completed and what work remains?
- **Guidance:** Obtain dates, scope, invoices, contractor details, and warranties.
- **Answer:** Number · unit `yr`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** year; local currency; roof area in m²

#### 2.5.2 Facade repair history `EX_CAP_FACADE_YEARS`

- **Question:** How many years have passed since the last major facade repair?
- **Original wording:** What facade repairs or replacements have been completed?
- **Guidance:** Review inspection reports, repair records, and unresolved defects.
- **Answer:** Number · unit `yr`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** year; local currency; percentage of facade repaired

#### 2.5.3 Elevator replacement and repair history `EX_CAP_ELEVATOR_AGE`

- **Question:** How old are the elevators?
- **Original wording:** What is the elevator’s service history and expected replacement need?
- **Guidance:** Obtain maintenance logs, inspection certificates, age, and replacement estimates.
- **Answer:** Number · unit `yr`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** years; failures per year; local currency; expected replacement year

#### 2.5.4 Plumbing and electrical replacement history `EX_CAP_PLUMB_ELEC_REPLACED`

- **Question:** What percentage of the plumbing and electrical systems has been replaced?
- **Original wording:** Have major plumbing and electrical components been replaced?
- **Guidance:** Identify components, coverage, materials, dates, and quality documentation.
- **Answer:** Number · unit `%`
- **Better:** higher
- **Method:** Document review (`documents`)
- **Source measures:** year; percentage of system replaced; local currency

#### 2.5.5 Heating-system repair history `EX_CAP_HEATING_AGE`

- **Question:** How old are the main heating-system components?
- **Original wording:** What major heating-system repairs or replacements have been completed?
- **Guidance:** Review boiler, heat exchanger, pumps, valves, distribution, and controls.
- **Answer:** Number · unit `yr`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** year; local currency; component age in years

#### 2.5.6 Maintenance backlog `EX_CAP_BACKLOG`

- **Question:** How many maintenance items are overdue or unresolved?
- **Original wording:** What maintenance work is overdue or unresolved?
- **Guidance:** Obtain the management’s defect register and verify a sample on site.
- **Answer:** Number · unit `pcs`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** number of outstanding items; local currency estimate; oldest item age in months

#### 2.5.7 Reserve funds `EX_CAP_RESERVE_MONTHS`

- **Question:** How many months of planned major-repair spending do the reserve funds cover?
- **Original wording:** Are sufficient funds available for planned major repairs?
- **Guidance:** Review reserve balance, contributions, restrictions, and projected expenditure.
- **Answer:** Number · unit `mo`
- **Better:** higher
- **Method:** Calculation (`calculation`)
- **Source measures:** local currency; local currency/m²; months of planned expenditure covered

#### 2.5.8 Planned major repairs `EX_CAP_MAJOR_REPAIR_COST`

- **Question:** What is the owner’s expected share of major repairs per m² over the next 5–10 years?
- **Original wording:** What major repairs are expected in the next 5–10 years?
- **Guidance:** Identify timing, scope, funding source, and owner contribution.
- **Answer:** Number · unit `cur/m²`
- **Better:** lower
- **Method:** Calculation (`calculation`)
- **Source measures:** local currency; year; local currency per apartment or m²

#### 2.5.9 Extraordinary assessments `EX_CAP_ONE_OFF_RISK`

- **Question:** How likely are additional one-off payments by owners?
- **Original wording:** Is there a risk of additional one-off payments by owners?
- **Guidance:** Review decisions, unresolved defects, reserve shortfalls, and planned works.
- **Answer:** Single choice
- **Options:** `none` No identified risk · `low` Low · `moderate` Moderate · `high` High
- **Better:** first option best
- **Method:** Document review (`documents`)
- **Source measures:** local currency per apartment; probability category; expected year

#### 2.5.10 Lifecycle cost forecast `EX_CAP_LIFECYCLE_FORECAST`

- **Question:** Is there a credible lifecycle maintenance-cost forecast?
- **Guidance:** Include major components, replacement cycles, inflation assumptions, and uncertainty.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** local currency over 5, 10, and 15 years; local currency/m²/year

## 2.6 Apartment-specific physical inspection

#### 2.6.1 Walls and partitions `EX_APT_WALLS`

- **Question:** Are walls and partitions free from material cracks, dampness, and defects?
- **Guidance:** Inspect finishes, junctions, corners, and signs of movement or moisture.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** crack width in mm; affected area in m²; moisture reading

#### 2.6.2 Ceilings `EX_APT_CEILINGS`

- **Question:** Are ceilings free from leaks, deformation, and unsafe finishes?
- **Guidance:** Inspect staining, cracks, sagging, and evidence of previous repairs.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** affected area in m²; deflection in mm; number of defects

#### 2.6.3 Floors `EX_APT_FLOORS`

- **Question:** Are floors level, stable, and in acceptable condition?
- **Guidance:** Check unevenness, squeaking, moisture, finish wear, and transitions.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** level deviation in mm over stated length; affected area in m²

#### 2.6.4 Windows and glazing `EX_APT_WINDOWS`

- **Question:** Are windows weather-tight, secure, and functional?
- **Guidance:** Inspect frames, seals, hardware, glazing, condensation, and opening operation.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** number of defective windows; U-value where known; repair cost in local currency

#### 2.6.5 Sound insulation `EX_APT_SOUND_INSULATION`

- **Question:** Does the apartment provide adequate acoustic separation from neighbors and outside noise?
- **Guidance:** Inspect at different times and identify airborne and impact noise.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** dB(A); airborne sound reduction in dB; impact sound level in dB where tested

#### 2.6.6 Internal plumbing `EX_APT_PLUMBING`

- **Question:** Are internal plumbing fixtures and pipes free from leaks and defects?
- **Guidance:** Test taps, toilets, drains, valves, and visible pipework.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** leaks per inspection; flow in L/min; pressure in bar

#### 2.6.7 Internal electrical wiring `EX_APT_WIRING_SAFE`

- **Question:** Is apartment wiring safe and sufficient for intended use?
- **Guidance:** Review wiring age, panel, protective devices, socket count, and test results.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Expert judgement (`expert`)
- **Source measures:** kW; amperes; number of circuits; inspection date

#### 2.6.8 Ventilation inside the apartment `EX_APT_VENTILATION`

- **Question:** Do kitchen and bathroom ventilation systems extract air effectively?
- **Guidance:** Check airflow, backdraft, blockages, and odors.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** m³/h; air changes per hour; CO₂ in ppm where relevant

#### 2.6.9 Renovation quality `EX_APT_RENOVATION`

- **Question:** Is the existing renovation work technically sound and durable?
- **Guidance:** Inspect substrate preparation, waterproofing, tiling, joinery, flooring, and concealed-work documentation.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** number of defects; repair estimate in local currency; affected area in m²

#### 2.6.10 Unauthorized modifications `EX_APT_ALTERATIONS_MATCH`

- **Question:** Do current apartment alterations match approved plans and applicable requirements?
- **Guidance:** Compare layout, wet areas, balconies, structural elements, and utility connections with technical documents.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** number of discrepancies; documentary/legal status
- **Knock-out candidate**

#### 2.6.11 Moisture and mold history `EX_APT_MOISTURE_HISTORY`

- **Question:** Has the apartment experienced leaks, condensation, or mold?
- **Guidance:** Ask for history and inspect concealed or previously repaired areas where possible.
- **Answer:** Yes / no
- **Better:** no
- **Method:** Document review (`documents`)
- **Source measures:** incidents per year; affected area in m²; relative humidity percentage

#### 2.6.12 Pests `EX_APT_PESTS`

- **Question:** How often do pests or infestations recur?
- **Original wording:** Is there evidence of recurring pests or infestation?
- **Guidance:** Inspect kitchen, bathrooms, service shafts, storage, and common areas. Review treatment records and recurrence.
- **Answer:** Rating on a scale · scale `frequency_5`
- **Better:** lower
- **Method:** Visual inspection (`visual`)
- **Source measures:** incidents per year; treatment cost in local currency

## 2.7 Legal ownership and transaction due diligence

#### 2.7.1 Seller identity and registered ownership `EX_LEG_SELLER_OWNER`

- **Question:** Is the seller the legally registered owner or properly authorized representative?
- **Guidance:** Verify identity, ownership record, authority to sell, and consistency of property identifiers.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** documentary pass/fail; verification date
- **Knock-out candidate**

#### 2.7.2 Ownership history `EX_LEG_OWNERSHIP_HISTORY`

- **Question:** Is the ownership history sufficiently clear and free from unresolved title concerns?
- **Guidance:** Review available transfer history, acquisition basis, and potential disputes.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** number of transfers; years of ownership; documentary status

#### 2.7.3 Co-owners and third-party rights `EX_LEG_THIRD_PARTIES`

- **Question:** Are there co-owners, occupants, beneficiaries, or other persons whose rights affect the sale?
- **Guidance:** Identify required consents, occupancy rights, and release arrangements.
- **Answer:** Yes / no
- **Better:** no
- **Method:** Document review (`documents`)
- **Source measures:** number of parties; documentary pass/fail

#### 2.7.4 Encumbrances and restrictions `EX_LEG_ENCUMBRANCES`

- **Question:** Is the apartment free from mortgages, liens, prohibitions, seizures, or other restrictions?
- **Guidance:** Obtain a current official registry extract and verify discharge requirements.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** number and type of encumbrances; documentary pass/fail; extract date
- **Knock-out candidate**

#### 2.7.5 Court and enforcement restrictions `EX_LEG_COURT_ACTIONS`

- **Question:** Are there court proceedings or enforcement actions affecting the seller or property?
- **Guidance:** Conduct appropriate checks and obtain legal advice on any matches.
- **Answer:** Yes / no
- **Better:** no
- **Method:** Document review (`documents`)
- **Source measures:** number of relevant proceedings; documentary status
- **Knock-out candidate**

#### 2.7.6 Inheritance and family-law issues `EX_LEG_FAMILY_LAW`

- **Question:** Could inheritance, marital property, guardianship, or other family-law issues affect transfer?
- **Guidance:** Verify required consents, certificates, and authority under local law.
- **Answer:** Yes / no
- **Better:** no
- **Method:** Document review (`documents`)
- **Source measures:** documentary pass/fail; number of required consents

#### 2.7.7 Registration and technical passport `EX_LEG_RECORDS_CONSISTENT`

- **Question:** Are the apartment’s registration record and technical documents current and consistent?
- **Guidance:** Compare address, unit number, floor, area, layout, and identifiers.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** number of discrepancies; m² difference; document dates
- **Knock-out candidate**

#### 2.7.8 Measured versus registered area `EX_LEG_AREA_DIFFERENCE`

- **Question:** By what percentage does the measured area differ from the registered area?
- **Original wording:** Does the measured apartment area match the registered area and sale agreement?
- **Guidance:** Commission measurement where material and clarify the treatment of balconies or other areas.
- **Answer:** Number · unit `%`
- **Better:** lower
- **Method:** Instrumental measurement (`measurement`)
- **Source measures:** m²; percentage difference

#### 2.7.9 Alteration approvals `EX_LEG_ALTERATION_APPROVALS`

- **Question:** Are all alterations requiring approval properly documented?
- **Guidance:** Check structural changes, wet-area relocation, extensions, balcony enclosures, and utility changes.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** number of alterations; documentary pass/fail

#### 2.7.10 Utility and management debts `EX_LEG_DEBTS`

- **Question:** Are there outstanding utility, tax, or building-management debts that could affect the transaction?
- **Guidance:** Obtain current statements and specify who will settle each balance.
- **Answer:** Yes / no
- **Better:** no
- **Method:** Document review (`documents`)
- **Source measures:** local currency; statement date

#### 2.7.11 Transaction payment and transfer mechanics `EX_LEG_TRANSFER_STEPS`

- **Question:** Are payment, signing, registration, possession, and key-transfer steps clearly documented?
- **Guidance:** Confirm escrow or payment protections where available, conditions precedent, and simultaneous exchange mechanics.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** dates; local currency; documentary pass/fail

#### 2.7.12 Independent legal review `EX_LEG_LAWYER_REVIEW`

- **Question:** Has an independent lawyer reviewed the title and transaction documents?
- **Guidance:** Confirm that the lawyer represents the buyer and has reviewed original or authoritative records.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** review date; number of unresolved legal issues; categorical result

## 2.8 Apartment position within the building

#### 2.8.1 Floor level `EX_POS_FLOOR`

- **Question:** On which floor is the apartment?
- **Original wording:** Is the apartment’s floor level suitable for the household and resale market?
- **Guidance:** Consider stairs, lift dependency, accessibility, security, noise, and market preferences.
- **Answer:** Number · unit `pcs`
- **Better:** target
- **Method:** Visual inspection (`visual`)
- **Source measures:** floor number; total storeys

#### 2.8.2 Ground-floor exposure `EX_POS_GROUND_RISK`

- **Question:** Does a ground or low floor create additional security, privacy, moisture, or noise risks?
- **Guidance:** Inspect access from public areas, window exposure, drainage, and basement proximity.
- **Answer:** Yes / no
- **Better:** no
- **Method:** Visual inspection (`visual`)
- **Source measures:** metres above ground; metres to public access; measured dB(A)

#### 2.8.3 Top-floor exposure `EX_POS_TOP_RISK`

- **Question:** Does a top-floor position create additional roof, heat, lift, or water-ingress risks?
- **Guidance:** Review roof condition, thermal performance, elevator reliability, and past leaks.
- **Answer:** Yes / no
- **Better:** no
- **Method:** Visual inspection (`visual`)
- **Source measures:** floor number; indoor temperature in °C; leak incidents per year

#### 2.8.4 Corner position `EX_POS_CORNER_RISK`

- **Question:** Does a corner position increase heat loss, dampness, or exposure?
- **Guidance:** Inspect external wall area, insulation continuity, and temperature differences.
- **Answer:** Yes / no
- **Better:** no
- **Method:** Visual inspection (`visual`)
- **Source measures:** external wall area in m²; surface temperature in °C; U-value

#### 2.8.5 Proximity to elevator and staircase `EX_POS_LIFT_NOISE`

- **Question:** Does proximity to lifts or stairs create noise, vibration, or privacy concerns?
- **Guidance:** Inspect during busy periods and review equipment-room adjacency.
- **Answer:** Yes / no
- **Better:** no
- **Method:** Visual inspection (`visual`)
- **Source measures:** metres; dB(A)

#### 2.8.6 Proximity to waste rooms and service areas `EX_POS_SERVICE_ROOMS`

- **Question:** Is the apartment affected by waste rooms, loading areas, or service rooms?
- **Guidance:** Assess odor, noise, pests, and operating hours.
- **Answer:** Yes / no
- **Better:** no
- **Method:** Visual inspection (`visual`)
- **Source measures:** metres; dB(A); odor incidents per week

#### 2.8.7 Neighboring apartment noise `EX_POS_NEIGHBOR_NOISE`

- **Question:** How often does noise from adjacent units or common areas reach the apartment?
- **Original wording:** Is the apartment exposed to noise from adjacent units or common areas?
- **Guidance:** Inspect shared walls, ceilings, floors, and circulation areas.
- **Answer:** Rating on a scale · scale `frequency_5`
- **Better:** lower
- **Method:** Visual inspection (`visual`)
- **Source measures:** dB(A); number of noise incidents per week

#### 2.8.8 View and outlook `EX_POS_VIEW`

- **Question:** The apartment has a durable and acceptable view.
- **Original wording:** Does the apartment have a durable and acceptable view?
- **Guidance:** Check current obstruction and likely future construction on surrounding plots.
- **Answer:** Rating on a scale · scale `agreement_5`
- **Better:** higher
- **Method:** Expert judgement (`expert`)
- **Source measures:** viewing distance in metres; compass direction in degrees

#### 2.8.9 Sun exposure by floor and orientation `EX_POS_SUNLIGHT`

- **Question:** Does the apartment receive suitable sunlight without excessive overheating?
- **Guidance:** Observe seasonal exposure and shading from adjacent buildings.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** hours of direct sunlight; indoor temperature in °C

#### 2.8.10 Privacy from public spaces `EX_POS_PRIVACY`

- **Question:** Can occupants maintain privacy from streets, courtyards, and neighboring buildings?
- **Guidance:** Check sightlines from public areas and opposing windows.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** metres; number of direct sightlines

---

# Part III: Property under development

109 questions. Top-level category: **Property under development**. Sections, which are its subcategories:

- 3.1 Developer credibility and track record (12)
- 3.2 Land ownership and construction legality (12)
- 3.3 Construction progress and execution (12)
- 3.4 Project financing and financial stability (12)
- 3.5 Construction technology and technical specifications (18)
- 3.6 Contractual obligations and buyer protection (17)
- 3.7 Completion, commissioning, and handover (14)
- 3.8 Development-stage market and investment risk (12)

## 3.1 Developer credibility and track record

#### 3.1.1 Company registration and legal identity `DV_DEV_LEGAL_IDENTITY`

- **Question:** Is the developer’s legal identity and registration independently verified?
- **Guidance:** Verify the contracting entity, registration status, directors, beneficial ownership where available, and authority to enter the transaction.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** documentary pass/fail; registration date; number of related entities
- **Knock-out candidate**

#### 3.1.2 Operating history `DV_DEV_YEARS`

- **Question:** How many years has the developer verifiably operated in residential construction?
- **Original wording:** Does the developer have a verifiable operating history in residential construction?
- **Guidance:** Record years in operation and projects undertaken under the same or related entities.
- **Answer:** Number · unit `yr`
- **Better:** higher
- **Method:** Document review (`documents`)
- **Source measures:** years; number of projects

#### 3.1.3 Completed projects `DV_DEV_COMPLETED_PROJECTS`

- **Question:** How many comparable projects has the developer completed that can be inspected?
- **Original wording:** Has the developer completed comparable projects that can be inspected?
- **Guidance:** Visit completed projects and verify the developer’s actual role.
- **Answer:** Number · unit `pcs`
- **Better:** higher
- **Method:** Document review (`documents`)
- **Source measures:** number of completed projects; units delivered; completion years

#### 3.1.4 Delivery record `DV_DEV_ON_TIME`

- **Question:** What percentage of the developer’s previous projects was delivered on time?
- **Original wording:** Has the developer delivered previous projects within the promised schedule?
- **Guidance:** Compare contractual and actual completion dates for a representative project sample.
- **Answer:** Number · unit `%`
- **Better:** higher
- **Method:** Calculation (`calculation`)
- **Source measures:** months of delay; percentage of projects delivered on time

#### 3.1.5 Construction quality in previous projects `DV_DEV_PAST_QUALITY`

- **Question:** Is the workmanship and long-term condition of previous projects acceptable?
- **Guidance:** Inspect common areas, facade, utilities, defects, and resident feedback.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** number of defects per inspected project; repair cost in local currency; years since handover

#### 3.1.6 Complaints and reputation `DV_DEV_COMPLAINTS`

- **Question:** Are there credible unresolved complaints or recurring disputes involving the developer?
- **Guidance:** Review court records, official complaints, resident associations, and independently corroborated reports.
- **Answer:** Yes / no
- **Better:** no
- **Method:** Document review (`documents`)
- **Source measures:** number of cases; claim value in local currency; resolution status

#### 3.1.7 Financial capacity `DV_DEV_FINANCIAL_CAPACITY`

- **Question:** Does the developer demonstrate sufficient financial capacity to complete the project?
- **Guidance:** Review available financial statements, capital, assets, liabilities, and independent financing evidence.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Expert judgement (`expert`)
- **Source measures:** local currency; debt-to-equity ratio; liquidity ratio; reporting year

#### 3.1.8 Litigation and insolvency exposure `DV_DEV_INSOLVENCY`

- **Question:** Are there material lawsuits, enforcement actions, insolvency proceedings, or unpaid obligations?
- **Guidance:** Check the contracting entity and relevant related entities; obtain legal interpretation of material findings.
- **Answer:** Yes / no
- **Better:** no
- **Method:** Document review (`documents`)
- **Source measures:** number of cases; local currency exposure; status

#### 3.1.9 Contractor and subcontractor capability `DV_DEV_CONTRACTORS`

- **Question:** Are principal contractors and specialist subcontractors qualified and sufficiently resourced?
- **Guidance:** Verify experience, licenses where required, project references, and contractual responsibilities.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Expert judgement (`expert`)
- **Source measures:** years of experience; number of comparable projects; workforce count

#### 3.1.10 Project management capability `DV_DEV_PROJECT_MANAGEMENT`

- **Question:** Is there an identifiable project-management and technical-supervision structure?
- **Guidance:** Identify responsible individuals, reporting lines, inspection procedures, and escalation process.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** named roles; inspection frequency; reporting frequency

#### 3.1.11 Related companies and project dependencies `DV_DEV_RELATED_DEPENDENCY`

- **Question:** Are critical project functions dependent on related companies or entities with unclear capacity?
- **Guidance:** Map landowner, developer, contractor, sales entity, financier, and utility counterparties.
- **Answer:** Yes / no
- **Better:** no
- **Method:** Document review (`documents`)
- **Source measures:** number of related entities; ownership percentage; documentary status

#### 3.1.12 Warranty and post-handover performance `DV_DEV_WARRANTY_RESOLVED`

- **Question:** What percentage of warranty claims on the developer’s previous projects was resolved?
- **Original wording:** Has the developer honored defect correction and warranty obligations on previous projects?
- **Guidance:** Obtain sample warranty claims, response times, and resident references.
- **Answer:** Number · unit `%`
- **Better:** higher
- **Method:** Calculation (`calculation`)
- **Source measures:** average response time in days; percentage of claims resolved; warranty period in years

## 3.2 Land ownership and construction legality

#### 3.2.1 Land rights and registration `DV_LEG_LAND_RIGHTS`

- **Question:** Does the project entity have legally sufficient and verified rights to the construction land?
- **Guidance:** Verify registered owner, lease or other rights, term, permitted transfers, and relationship to the contracting entity.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** documentary pass/fail; land area in m²; lease term in years where applicable
- **Knock-out candidate**

#### 3.2.2 Land-use designation `DV_LEG_LAND_USE`

- **Question:** Does the land’s permitted use allow the proposed residential development?
- **Guidance:** Compare registered designation, planning rules, and project purpose.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** documentary pass/fail; land area in m²

#### 3.2.3 Encumbrances and land disputes `DV_LEG_LAND_CLEAR`

- **Question:** Is the land free from material encumbrances, competing claims, or unresolved disputes?
- **Guidance:** Obtain current official records and legal review.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** number and type of restrictions; documentary pass/fail

#### 3.2.4 Construction authorization `DV_LEG_AUTHORIZATION`

- **Question:** Are all legally required construction authorizations in place for the current project stage?
- **Guidance:** Verify issuing authority, scope, validity, conditions, and whether work on site matches the authorization.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** documentary pass/fail; issue and expiry dates
- **Knock-out candidate**

#### 3.2.5 Approved project documentation `DV_LEG_APPROVED_DESIGN`

- **Question:** Is there an approved project design consistent with the marketed building and apartment?
- **Guidance:** Review approved drawings, specifications, expert reviews where required, and revision history.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** document status; revision number; approval date
- **Knock-out candidate**

#### 3.2.6 Height, density, and footprint compliance `DV_LEG_HEIGHT_DENSITY`

- **Question:** Do proposed height, density, and building footprint comply with applicable planning approvals?
- **Guidance:** Compare approved parameters with marketing materials and site conditions.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** storeys; metres; floor-area ratio; plot coverage percentage

#### 3.2.7 Urban-planning compliance `DV_LEG_URBAN_PLANNING`

- **Question:** Is the project consistent with applicable urban-planning requirements and restrictions?
- **Guidance:** Check setbacks, access, fire lanes, public easements, protected zones, and required public facilities.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** metres; m²; documentary compliance status

#### 3.2.8 Environmental approvals `DV_LEG_ENVIRONMENTAL`

- **Question:** Are environmental assessments or approvals required, completed, and valid?
- **Guidance:** Verify scope, conditions, mitigation obligations, and monitoring.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** documentary status; approval date; number of outstanding conditions

#### 3.2.9 Utility connection conditions `DV_LEG_UTILITY_CONDITIONS`

- **Question:** Are formal utility connection conditions and capacity confirmations available?
- **Guidance:** Review electricity, water, sewerage, heating, gas, and telecommunications conditions.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** kW; m³/day; connection capacity; documentary status

#### 3.2.10 Land access and easements `DV_LEG_ACCESS_EASEMENTS`

- **Question:** Does the project have secure legal access and required easements?
- **Guidance:** Verify road access, utility corridors, rights of way, and shared access obligations.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** metres; number of easements; documentary pass/fail

#### 3.2.11 Neighboring rights and disputes `DV_LEG_THIRD_PARTY_DISPUTES`

- **Question:** Are there disputes or third-party rights that could delay or restrict construction?
- **Guidance:** Review boundary disputes, access objections, court cases, and utility conflicts.
- **Answer:** Yes / no
- **Better:** no
- **Method:** Document review (`documents`)
- **Source measures:** number of disputes; expected delay in months; status

#### 3.2.12 Project modifications and approvals `DV_LEG_CHANGES_APPROVED`

- **Question:** Have material project changes been approved by the relevant authorities?
- **Guidance:** Compare current construction and sales plans with approved design revisions.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** number of material revisions; approval dates; documentary status
- **Knock-out candidate**

## 3.3 Construction progress and execution

#### 3.3.1 Actual construction stage `DV_CON_PROGRESS_MATCHES`

- **Question:** Does independently observed construction progress match the developer’s stated stage?
- **Guidance:** Record completed work by building section and compare with dated schedule and site evidence.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Visual inspection (`visual`)
- **Source measures:** percentage complete by work package; inspection date

#### 3.3.2 Schedule compliance `DV_CON_SCHEDULE_DELAY`

- **Question:** How many months is construction behind the baseline schedule?
- **Original wording:** Is construction progressing in accordance with the baseline schedule?
- **Guidance:** Compare planned and actual milestones; identify critical-path delays.
- **Answer:** Number · unit `mo`
- **Better:** lower
- **Method:** Calculation (`calculation`)
- **Source measures:** days or months ahead/behind; percentage of milestones achieved

#### 3.3.3 Foundation execution `DV_CON_FOUNDATION`

- **Question:** Was the foundation constructed in accordance with approved design and geotechnical requirements?
- **Guidance:** Review excavation, reinforcement, concrete, waterproofing, test records, and technical supervision reports.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** concrete strength in MPa; reinforcement diameter in mm; foundation dimensions in mm or m

#### 3.3.4 Structural frame quality `DV_CON_FRAME`

- **Question:** How well is the structural frame being executed against the approved design and quality controls?
- **Original wording:** Is the structural frame being executed in accordance with the approved design and quality controls?
- **Guidance:** Review concrete and reinforcement records, tolerances, inspections, and non-conformance reports.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Expert judgement (`expert`)
- **Source measures:** concrete strength in MPa; dimensional deviation in mm; inspection count

#### 3.3.5 Materials traceability `DV_CON_MATERIALS_TRACED`

- **Question:** What percentage of sampled critical materials has complete documentation?
- **Original wording:** Can critical construction materials be traced to specifications and quality documents?
- **Guidance:** Check certificates, delivery records, batch data, and substitution approvals.
- **Answer:** Number · unit `%`
- **Better:** higher
- **Method:** Calculation (`calculation`)
- **Source measures:** percentage of sampled materials with complete documentation; batch count

#### 3.3.6 Independent technical supervision `DV_CON_SUPERVISION`

- **Question:** Is independent technical supervision active and adequately documented?
- **Guidance:** Identify supervising organization, qualifications, site visits, reports, and unresolved findings.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** inspections per month; number of open findings; report date

#### 3.3.7 Quality-control procedures `DV_CON_QUALITY_CONTROL`

- **Question:** Are inspection and testing procedures implemented for critical work?
- **Guidance:** Review inspection and test plans, laboratory results, hold points, and corrective actions.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Document review (`documents`)
- **Source measures:** tests completed; pass percentage; open non-conformities

#### 3.3.8 Workforce and equipment `DV_CON_WORKFORCE`

- **Question:** Are sufficient qualified workers and equipment available to sustain progress?
- **Guidance:** Observe site activity and verify contractor resources against the work programme.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** workers per shift; equipment count; productive days per month

#### 3.3.9 Weather and seasonal exposure `DV_CON_WEATHER`

- **Question:** Are weather-sensitive works scheduled and protected appropriately?
- **Guidance:** Check concrete placement, waterproofing, facade work, and material storage against conditions.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** days of weather delay; °C; precipitation in mm

#### 3.3.10 Construction interruptions `DV_CON_STOPPAGES`

- **Question:** How many days in total has work been stopped?
- **Original wording:** Have there been prolonged work stoppages or periods of low activity?
- **Guidance:** Record dates, duration, stated causes, and evidence of restart.
- **Answer:** Number · unit `day`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** number of stoppages; total days or months

#### 3.3.11 Defect management `DV_CON_OPEN_DEFECTS`

- **Question:** How many construction defects are currently open?
- **Original wording:** Are construction defects recorded, corrected, and independently closed?
- **Guidance:** Review defect registers, corrective actions, retesting, and repeat defects.
- **Answer:** Number · unit `pcs`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** open defects; closure time in days; recurrence percentage

#### 3.3.12 Progress evidence `DV_CON_EVIDENCE_AGE`

- **Question:** How many days old is the latest dated progress evidence?
- **Original wording:** Is there a reliable dated record of progress that can be independently checked?
- **Guidance:** Collect dated photographs, inspection reports, milestone certificates, and site-visit records.
- **Answer:** Number · unit `day`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** evidence update frequency; age of latest evidence in days

## 3.4 Project financing and financial stability

#### 3.4.1 Funding structure `DV_FIN_FUNDING_STRUCTURE`

- **Question:** Is the project’s funding structure documented and credible?
- **Guidance:** Identify developer equity, bank loans, institutional finance, presales, and other sources.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Document review (`documents`)
- **Source measures:** local currency; percentage of total project budget by source

#### 3.4.2 Developer equity `DV_FIN_EQUITY`

- **Question:** What percentage of total project cost is covered by verified developer equity?
- **Original wording:** Has the developer committed sufficient equity relative to project cost?
- **Guidance:** Verify actual invested funds rather than announced commitments.
- **Answer:** Number · unit `%`
- **Better:** higher
- **Method:** Calculation (`calculation`)
- **Source measures:** local currency; percentage of total project cost

#### 3.4.3 Bank or institutional financing `DV_FIN_EXTERNAL_COMMITTED`

- **Question:** Is external financing formally committed and available under clear conditions?
- **Guidance:** Review lender, amount, drawdown conditions, maturity, security, and termination rights.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** local currency; interest rate percentage; maturity date

#### 3.4.4 Budget adequacy `DV_FIN_BUDGET`

- **Question:** Is the project budget complete and consistent with the remaining construction scope?
- **Guidance:** Review cost plan, remaining commitments, inflation assumptions, and contingency.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Document review (`documents`)
- **Source measures:** local currency; local currency/m²; contingency percentage

#### 3.4.5 Cost escalation contingency `DV_FIN_CONTINGENCY`

- **Question:** What cost increase, as a percentage, can the project absorb?
- **Original wording:** Is there adequate financial capacity to absorb construction-cost increases?
- **Guidance:** Stress-test material, labor, currency, and financing cost changes.
- **Answer:** Number · unit `%`
- **Better:** higher
- **Method:** Calculation (`calculation`)
- **Source measures:** percentage cost increase; local currency contingency

#### 3.4.6 Dependence on presales `DV_FIN_PRESALE_DEPENDENCE`

- **Question:** What percentage of the budget depends on presales?
- **Original wording:** Does the project depend excessively on future apartment sales to fund completion?
- **Guidance:** Review presales, collected cash, restricted funds, and remaining obligations.
- **Answer:** Number · unit `%`
- **Better:** lower
- **Method:** Calculation (`calculation`)
- **Source measures:** percentage of budget funded by presales; units sold; cash collected in local currency

#### 3.4.7 Financial transparency `DV_FIN_TRANSPARENCY`

- **Question:** Are project financial disclosures sufficiently detailed and current?
- **Guidance:** Check reporting periods, independent assurance, related-party transactions, and consistency.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Document review (`documents`)
- **Source measures:** reporting frequency; age of latest report in months; document completeness percentage

#### 3.4.8 Contractor payment status `DV_FIN_CONTRACTORS_PAID`

- **Question:** Are principal contractors and suppliers being paid in accordance with contracts?
- **Guidance:** Review payment certificates, arrears, disputes, and evidence of work stoppages.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** local currency arrears; days overdue; number of disputed invoices

#### 3.4.9 Debt obligations `DV_FIN_DEBT_RISK`

- **Question:** Could existing debt obligations materially impair project completion?
- **Guidance:** Review secured debt, maturity concentration, guarantees, and cross-default exposure.
- **Answer:** Yes / no
- **Better:** no
- **Method:** Document review (`documents`)
- **Source measures:** local currency; debt-service coverage ratio; maturity dates

#### 3.4.10 Completion reserve `DV_FIN_COMPLETION_RESERVE`

- **Question:** What percentage of the estimated cost to complete does the dedicated reserve cover?
- **Original wording:** Is there a dedicated and sufficient reserve to complete the project?
- **Guidance:** Verify whether funds are ring-fenced, accessible, and sufficient for remaining works.
- **Answer:** Number · unit `%`
- **Better:** higher
- **Method:** Calculation (`calculation`)
- **Source measures:** local currency; percentage of estimated cost to complete

#### 3.4.11 Downside funding stress test `DV_FIN_LIQUIDITY_MONTHS`

- **Question:** For how many months could the project keep going if sales slowed materially?
- **Original wording:** Could the project continue if sales slowed materially for six months?
- **Guidance:** Test liquidity under lower sales, higher costs, delayed financing, and slower collections.
- **Answer:** Number · unit `mo`
- **Better:** higher
- **Method:** Calculation (`calculation`)
- **Source measures:** months of liquidity; local currency funding gap; units/month sold under stress case

#### 3.4.12 Financial monitoring `DV_FIN_MONITORING`

- **Question:** Is there a process for monitoring and disclosing material financial deterioration?
- **Guidance:** Identify reporting owner, frequency, triggers, and escalation actions.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** reporting frequency; number of triggers; time to disclose in days

## 3.5 Construction technology and technical specifications

#### 3.5.1 Structural system `DV_TEC_STRUCTURAL_SYSTEM`

- **Question:** Is the structural system clearly specified and appropriate for the site and building?
- **Guidance:** Identify frame, wall, core, slab, and lateral-resisting systems. Obtain design documentation and independent engineering review.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Expert judgement (`expert`)
- **Source measures:** categorical system; design parameters as stated in engineering documents

#### 3.5.2 Foundation system and geotechnical basis `DV_TEC_GEOTECHNICAL`

- **Question:** Is the foundation design supported by an adequate geotechnical investigation?
- **Guidance:** Review soil layers, groundwater, bearing capacity, settlement analysis, and foundation selection.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Expert judgement (`expert`)
- **Source measures:** borehole depth in m; bearing capacity in kPa; groundwater depth in m

#### 3.5.3 Seismic design `DV_TEC_SEISMIC_DESIGN`

- **Question:** Is the building designed for the applicable site-specific seismic requirements?
- **Guidance:** Verify design basis, structural calculations, detailing, ductility provisions, and independent review.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Expert judgement (`expert`)
- **Source measures:** applicable code parameters; design acceleration in m/s² or g where specified

#### 3.5.4 Concrete specifications and quality control `DV_TEC_CONCRETE`

- **Question:** Are concrete grade, mix, placement, curing, and test results documented?
- **Guidance:** Review batch certificates, sampling, laboratory tests, and non-conformance actions.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Document review (`documents`)
- **Source measures:** MPa; slump in mm; curing days; test count

#### 3.5.5 Reinforcement specifications `DV_TEC_REINFORCEMENT`

- **Question:** Are reinforcement grade, diameter, spacing, and installation verified?
- **Guidance:** Compare material certificates and site inspection records with approved drawings.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** MPa; mm; kg/m³ where specified

#### 3.5.6 External walls `DV_TEC_WALL_U_VALUE`

- **Question:** What is the specified U-value of the external walls?
- **Original wording:** Are external wall materials and assemblies specified for durability and thermal performance?
- **Guidance:** Review layers, thickness, fire characteristics, moisture control, and installation details.
- **Answer:** Number · unit `W/(m²·K)`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** mm; U-value in W/(m²·K); fire rating in minutes

#### 3.5.7 Acoustic insulation `DV_TEC_SOUND_REDUCTION`

- **Question:** What sound reduction index (Rw) is specified between apartments?
- **Original wording:** Do the specified floor, wall, and facade assemblies provide adequate acoustic insulation?
- **Guidance:** Review tested or calculated performance and construction details.
- **Answer:** Number · unit `dB`
- **Better:** higher
- **Method:** Document review (`documents`)
- **Source measures:** dB; weighted sound reduction index Rw; impact sound level Ln,w

#### 3.5.8 Windows and glazing `DV_TEC_WINDOW_U_VALUE`

- **Question:** What is the specified U-value of the windows?
- **Original wording:** Are window and glazing specifications adequate for thermal, acoustic, and safety requirements?
- **Guidance:** Verify frame type, glazing layers, seals, hardware, and installation details.
- **Answer:** Number · unit `W/(m²·K)`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** U-value in W/(m²·K); dB; glass thickness in mm

#### 3.5.9 Roof and waterproofing design `DV_TEC_ROOF_DESIGN`

- **Question:** Is the roof assembly designed for drainage, waterproofing, insulation, and maintainability?
- **Guidance:** Review membrane, drainage falls, outlets, insulation, access, and warranty.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Expert judgement (`expert`)
- **Source measures:** slope percentage; insulation thickness in mm; warranty years

#### 3.5.10 Heating design `DV_TEC_HEATING_DESIGN`

- **Question:** Is the heating system designed to provide adequate capacity and controllability?
- **Guidance:** Review heat source, distribution, metering, controls, and operating-cost assumptions.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Expert judgement (`expert`)
- **Source measures:** kW; W/m²; expected energy use in kWh/m²/year

#### 3.5.11 Electrical capacity `DV_TEC_ELECTRICAL_CAPACITY`

- **Question:** What electrical capacity is planned per apartment?
- **Original wording:** Is the planned electrical capacity sufficient for apartments and common systems?
- **Guidance:** Review incoming capacity, apartment allocation, backup, protection, and future expansion.
- **Answer:** Number · unit `kW`
- **Better:** higher
- **Method:** Document review (`documents`)
- **Source measures:** kW per apartment; kW per building; amperes

#### 3.5.12 Water supply and sewerage design `DV_TEC_WATER_DESIGN`

- **Question:** Are water supply, pressure zoning, storage, pumping, and sewerage adequately designed?
- **Guidance:** Review utility conditions, hydraulic calculations, pumps, tanks, and drainage.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Expert judgement (`expert`)
- **Source measures:** m³/day; bar or kPa; litres; pipe diameter in mm

#### 3.5.13 Ventilation design `DV_TEC_VENTILATION_DESIGN`

- **Question:** Does the ventilation design provide adequate fresh air and extraction?
- **Guidance:** Review natural/mechanical systems, airflow rates, shafts, filtration, and maintenance access.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Expert judgement (`expert`)
- **Source measures:** m³/h; air changes per hour; CO₂ target in ppm where specified

#### 3.5.14 Elevator specification `DV_TEC_ELEVATOR_SPEC`

- **Question:** Are elevator number, capacity, speed, and manufacturer appropriate for the building?
- **Guidance:** Review traffic calculations, service access, warranty, and maintenance arrangements.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Expert judgement (`expert`)
- **Source measures:** number; persons or kg; m/s; expected waiting time in seconds

#### 3.5.15 Fire protection design `DV_TEC_FIRE_DESIGN`

- **Question:** Does the fire strategy cover detection, evacuation, compartmentation, and firefighting access?
- **Guidance:** Review approved fire-safety documentation and system specifications.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Expert judgement (`expert`)
- **Source measures:** fire-resistance rating in minutes; number of exits; system coverage percentage

#### 3.5.16 Energy efficiency `DV_TEC_ENERGY_USE`

- **Question:** What annual energy use per m² is documented?
- **Original wording:** Is energy performance documented rather than described only with marketing terms?
- **Guidance:** Review energy calculations, envelope specifications, system efficiency, and commissioning requirements.
- **Answer:** Number · unit `kWh/m²·yr`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** kWh/m²/year; energy class where officially defined

#### 3.5.17 Material substitution `DV_TEC_SUBSTITUTION`

- **Question:** Can the developer substitute specified materials or equipment without buyer approval or equivalent quality controls?
- **Guidance:** Review contract and technical specification clauses for substitution rights and notification.
- **Answer:** Yes / no
- **Better:** no
- **Method:** Document review (`documents`)
- **Source measures:** number of substitution categories; documentary status

#### 3.5.18 Technical specification completeness `DV_TEC_SPEC_COMPLETENESS`

- **Question:** What percentage of key systems has measurable specifications?
- **Original wording:** Are technical specifications sufficiently detailed to verify the delivered product?
- **Guidance:** Confirm brands or performance standards, dimensions, grades, tolerances, and acceptance criteria.
- **Answer:** Number · unit `%`
- **Better:** higher
- **Method:** Calculation (`calculation`)
- **Source measures:** percentage of key systems with measurable specifications; number of unresolved items

## 3.6 Contractual obligations and buyer protection

#### 3.6.1 Contracting entity and legal form `DV_CTR_ENTITY`

- **Question:** Is the contract concluded with the correct legal entity and under a legally reviewed arrangement?
- **Guidance:** Verify authority, registration, project rights, and enforceability under applicable local law.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** documentary pass/fail; legal review date
- **Knock-out candidate**

#### 3.6.2 Unit identification `DV_CTR_UNIT_IDENTIFIED`

- **Question:** Does the contract identify the apartment unambiguously?
- **Guidance:** Include building, entrance, floor, unit number, plan, orientation, and boundaries.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** number of matching identifiers; documentary pass/fail

#### 3.6.3 Area and measurement method `DV_CTR_AREA_METHOD`

- **Question:** Is the apartment area defined with a clear measurement method?
- **Guidance:** Specify whether balconies, loggias, terraces, and wall areas are included and how final measurement is performed.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** m²; permitted variance percentage

#### 3.6.4 Purchase price and adjustment `DV_CTR_PRICE_TYPE`

- **Question:** How is the purchase price set in the contract?
- **Original wording:** Is the purchase price fixed or subject to clearly defined adjustment rules?
- **Guidance:** Check currency, indexation, exchange-rate exposure, taxes, and additional charges.
- **Answer:** Single choice
- **Options:** `fixed` Fixed price · `clear_rule` Adjustable by a clear rule · `open` Adjustable without a clear rule
- **Better:** first option best
- **Method:** Document review (`documents`)
- **Source measures:** local currency; local currency/m²; adjustment percentage

#### 3.6.5 Payment schedule `DV_CTR_PAYMENT_MILESTONES`

- **Question:** Are payment dates and amounts tied to clear contractual milestones?
- **Guidance:** Check advance payments, staged payments, evidence of milestone completion, and payment recipient.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** local currency; percentage of price; milestone dates

#### 3.6.6 Payment protection `DV_CTR_PAYMENTS_PROTECTED`

- **Question:** What percentage of buyer payments is protected if construction stops or the developer defaults?
- **Original wording:** Are buyer payments protected if construction stops or the developer defaults?
- **Guidance:** Review escrow, guarantees, insurance, security, refund rights, and legal enforceability.
- **Answer:** Number · unit `%`
- **Better:** higher
- **Method:** Document review (`documents`)
- **Source measures:** protected amount in local currency; percentage of payments protected; documentary status
- **Knock-out candidate**

#### 3.6.7 Completion date `DV_CTR_COMPLETION_DATE`

- **Question:** Is the contractual completion and handover date precise and objectively verifiable?
- **Guidance:** Distinguish construction completion, commissioning, handover, and title registration dates.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** calendar date; permitted extension in days or months

#### 3.6.8 Delay penalties `DV_CTR_DELAY_REMEDIES`

- **Question:** How meaningful are the remedies the contract gives for developer delay?
- **Original wording:** Does the contract provide meaningful remedies for developer delay?
- **Guidance:** Review penalty rate, cap, grace period, exclusions, and enforceability.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Expert judgement (`expert`)
- **Source measures:** percentage per day/month; local currency; maximum penalty

#### 3.6.9 Termination and refund `DV_CTR_TERMINATION_REFUND`

- **Question:** Can the buyer terminate and recover funds under clearly defined circumstances?
- **Guidance:** Review default triggers, notice periods, refund deadline, deductions, and dispute process.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** refund period in days; deductions percentage; recoverable local currency

#### 3.6.10 Area discrepancy settlement `DV_CTR_AREA_SETTLEMENT`

- **Question:** How fair and clear is the way final area differences are settled?
- **Original wording:** How are final area differences settled?
- **Guidance:** Confirm measurement authority, tolerance, price adjustment, and buyer cancellation rights.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Expert judgement (`expert`)
- **Source measures:** m²; percentage variance; local currency/m²

#### 3.6.11 Layout and specification changes `DV_CTR_UNILATERAL_CHANGES`

- **Question:** Can the developer change the apartment layout, building design, or specifications unilaterally?
- **Guidance:** Identify material-change definitions, buyer consent, notification, and remedies.
- **Answer:** Yes / no
- **Better:** no
- **Method:** Document review (`documents`)
- **Source measures:** number of change categories; notice period in days

#### 3.6.12 Quality and defect obligations `DV_CTR_DEFECT_OBLIGATIONS`

- **Question:** Does the contract define acceptance standards and the developer’s defect-correction obligations?
- **Guidance:** Check inspection rights, defect lists, repair deadlines, access, and consequences of non-performance.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** defect correction period in days; warranty years

#### 3.6.13 Defect liability and warranties `DV_CTR_STRUCTURAL_WARRANTY`

- **Question:** How many years is the structural warranty?
- **Original wording:** Are warranty periods and exclusions clearly stated for structural and non-structural elements?
- **Guidance:** Check separate warranties for structure, waterproofing, facade, equipment, and finishes.
- **Answer:** Number · unit `yr`
- **Better:** higher
- **Method:** Document review (`documents`)
- **Source measures:** years; response time in days

#### 3.6.14 Ownership transfer and registration `DV_CTR_OWNERSHIP_TRANSFER`

- **Question:** Does the contract specify how and when legal ownership will be transferred and registered?
- **Guidance:** Identify prerequisites, responsible party, documents, costs, and remedies if registration fails.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** deadline in days; local currency; documentary pass/fail

#### 3.6.15 Third-party rights `DV_CTR_ENCUMBER_RIGHT`

- **Question:** Can the developer assign, pledge, or otherwise encumber the project or buyer’s unit?
- **Guidance:** Review lender rights, assignment clauses, and required consents.
- **Answer:** Yes / no
- **Better:** no
- **Method:** Document review (`documents`)
- **Source measures:** number and type of permitted encumbrances; documentary status

#### 3.6.16 Dispute resolution `DV_CTR_DISPUTE_RESOLUTION`

- **Question:** Are governing law, jurisdiction, dispute process, and language provisions clear and acceptable?
- **Guidance:** Have an independent lawyer assess enforceability and practical access to remedies.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Expert judgement (`expert`)
- **Source measures:** documentary pass/fail; dispute deadline in days

#### 3.6.17 Independent contract review `DV_CTR_LAWYER_REVIEW`

- **Question:** Has the buyer’s independent lawyer reviewed the final contract and its annexes?
- **Guidance:** Include technical specification, floor plan, payment schedule, and all referenced documents.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** review date; number of unresolved clauses

## 3.7 Completion, commissioning, and handover

#### 3.7.1 Completion against contractual scope `DV_HND_WORK_COMPLETE`

- **Question:** What percentage of the contractual scope is physically complete?
- **Original wording:** Is the building physically complete in accordance with the contractual scope?
- **Guidance:** Inspect apartments, common areas, facade, landscaping, parking, and shared systems.
- **Answer:** Number · unit `%`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** percentage of work complete; number of outstanding items

#### 3.7.2 Commissioning and occupancy documentation `DV_HND_COMMISSIONING`

- **Question:** Has the building obtained all approvals required for lawful commissioning and occupation?
- **Guidance:** Verify official documents, issuing authority, scope, date, and conditions.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** documentary pass/fail; approval date

#### 3.7.3 Utility connections `DV_HND_UTILITIES`

- **Question:** Are permanent utility connections installed, tested, and operational?
- **Guidance:** Verify electricity, water, sewerage, heating, gas, and communications.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** connection capacity; test date; interruptions during test period

#### 3.7.4 Elevator commissioning `DV_HND_ELEVATORS`

- **Question:** Are elevators installed, tested, certified, and available for normal use?
- **Guidance:** Review commissioning records, inspection certificates, maintenance contracts, and backup arrangements.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** number; capacity in kg/persons; commissioning date

#### 3.7.5 Common-area completion `DV_HND_COMMON_COMPLETE`

- **Question:** What percentage of entrances, corridors, stairs, fire systems, and shared rooms is complete?
- **Original wording:** Are entrances, corridors, stairs, fire systems, and shared rooms complete?
- **Guidance:** Compare actual delivery with approved plans and contractual specifications.
- **Answer:** Number · unit `%`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** percentage complete; number of defects

#### 3.7.6 Landscaping and external works `DV_HND_EXTERNAL_COMPLETE`

- **Question:** What percentage of external works and landscaping is complete?
- **Original wording:** Are external works, access roads, drainage, lighting, and landscaping complete?
- **Guidance:** Check promised playgrounds, green areas, parking, and pedestrian access.
- **Answer:** Number · unit `%`
- **Better:** higher
- **Method:** Visual inspection (`visual`)
- **Source measures:** m²; number of facilities; percentage complete

#### 3.7.7 Fire-safety readiness `DV_HND_FIRE_READY`

- **Question:** Are fire-safety systems tested and ready for operation?
- **Guidance:** Verify alarms, evacuation lighting, smoke control, extinguishers, fire doors, and access.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** test date; number of defects; system coverage percentage

#### 3.7.8 Technical documentation handover `DV_HND_DOCUMENTS`

- **Question:** What percentage of required technical and operating documents will the buyer receive?
- **Original wording:** Will the buyer receive complete technical and operating documentation?
- **Guidance:** Identify apartment plan, technical passport, warranties, equipment manuals, and utility information.
- **Answer:** Number · unit `%`
- **Better:** higher
- **Method:** Document review (`documents`)
- **Source measures:** percentage of required documents delivered; handover date

#### 3.7.9 Ownership registration process `DV_HND_REGISTRATION`

- **Question:** Is there a clear and legally workable process for registering ownership of the apartment?
- **Guidance:** Confirm required documents, responsible party, deadlines, and handling of delays or refusal.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** days to registration; documentary pass/fail

#### 3.7.10 Independent handover inspection `DV_HND_INSPECTION_RIGHT`

- **Question:** Can the buyer conduct an independent technical inspection before accepting the apartment?
- **Guidance:** Confirm access, inspection scope, specialist attendance, and ability to record defects.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** inspection period in days; number of permitted visits

#### 3.7.11 Defect correction before acceptance `DV_HND_DEFECTS_FIRST`

- **Question:** Must material defects be corrected before final acceptance or payment?
- **Guidance:** Review contract and handover procedure; record unresolved defects and agreed deadlines.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** number of defects; correction deadline in days; local currency retention amount

#### 3.7.12 Warranty commencement `DV_HND_WARRANTY_START`

- **Question:** When do warranties begin?
- **Original wording:** When do warranties begin and what events trigger or limit coverage?
- **Guidance:** Check commencement date, covered components, exclusions, claim method, and responsible party.
- **Answer:** Single choice
- **Options:** `handover` From handover or acceptance · `commissioning` From commissioning · `unclear` Earlier or not clearly stated
- **Better:** first option best
- **Method:** Document review (`documents`)
- **Source measures:** years; commencement date; claim response time in days

#### 3.7.13 Building management after handover `DV_HND_MANAGEMENT`

- **Question:** Is a competent management arrangement in place from the first occupation period?
- **Guidance:** Identify interim and permanent manager, budget, service contracts, and owner governance.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** local currency/m²/month; contract term in years

#### 3.7.14 Occupancy readiness `DV_HND_OCCUPANCY`

- **Question:** Can the apartment be lawfully and practically occupied on handover?
- **Guidance:** Confirm safe access, operational utilities, completed essential systems, and required legal documents.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Document review (`documents`)
- **Source measures:** documentary pass/fail; number of outstanding critical items

## 3.8 Development-stage market and investment risk

#### 3.8.1 Presale price versus completed comparables `DV_RSK_PRESALE_DISCOUNT`

- **Question:** What discount does the presale price give against completed comparable apartments?
- **Original wording:** Is the presale price attractive compared with completed comparable apartments?
- **Guidance:** Compare location, specification, size, floor, completion risk, and transaction evidence.
- **Answer:** Number · unit `%`
- **Better:** higher
- **Method:** Calculation (`calculation`)
- **Source measures:** local currency/m²; percentage premium or discount

#### 3.8.2 Completion-value assumptions `DV_RSK_COMPLETION_VALUE`

- **Question:** How well is the projected completed value supported by realistic market evidence?
- **Original wording:** Is the projected completed value supported by realistic market evidence?
- **Guidance:** Use completed sales and adjust for time, inflation, specification, and supply.
- **Answer:** Rating on a scale · scale `quality_5`
- **Better:** higher
- **Method:** Expert judgement (`expert`)
- **Source measures:** local currency/m²; annual appreciation percentage; forecast period in years

#### 3.8.3 Risk discount for construction-stage purchase `DV_RSK_PRICE_COVERS_RISK`

- **Question:** Does the price adequately compensate for delay, non-completion, specification, and legal risks?
- **Guidance:** Compare the presale discount with quantified downside scenarios and alternative completed units.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Expert judgement (`expert`)
- **Source measures:** percentage discount; local currency risk allowance

#### 3.8.4 Competing development supply `DV_RSK_COMPETING_UNITS`

- **Question:** How many competing units are expected to be delivered around the same time?
- **Original wording:** How much competing residential supply is expected to be delivered around the same time?
- **Guidance:** Identify projects by location, unit count, price segment, and delivery schedule.
- **Answer:** Number · unit `pcs`
- **Better:** lower
- **Method:** Document review (`documents`)
- **Source measures:** units; delivery year; distance in kilometres

#### 3.8.5 Resale liquidity after completion `DV_RSK_RESALE_DAYS`

- **Question:** How many days on the market are estimated for resale after completion?
- **Original wording:** How readily could the apartment be resold after completion?
- **Guidance:** Estimate competing completed supply, buyer demand, project reputation, and title-registration timing.
- **Answer:** Number · unit `day`
- **Better:** lower
- **Method:** Expert judgement (`expert`)
- **Source measures:** estimated days on market; expected discount percentage

#### 3.8.6 Rental readiness and demand `DV_RSK_FIT_OUT_COST`

- **Question:** What will it cost to make the completed apartment ready for rental?
- **Original wording:** Will the completed apartment be suitable for rental without substantial additional expenditure?
- **Guidance:** Estimate finishing, furnishing, utility activation, management, and tenant demand.
- **Answer:** Number · unit `cur`
- **Better:** lower
- **Method:** Calculation (`calculation`)
- **Source measures:** local currency fit-out cost; local currency/month rent; days to let

#### 3.8.7 Rental competition `DV_RSK_RENTAL_COMPETITION`

- **Question:** What percentage of project units is expected to enter the rental market at the same time?
- **Original wording:** Will multiple similar units enter the rental market at the same time?
- **Guidance:** Estimate investor-owned units in the project and competing developments.
- **Answer:** Number · unit `%`
- **Better:** lower
- **Method:** Expert judgement (`expert`)
- **Source measures:** number of units; percentage of project units; expected rent discount percentage

#### 3.8.8 Downturn resilience `DV_RSK_DOWNTURN_LOSS`

- **Question:** What percentage of value could be lost in a downturn at or shortly after completion?
- **Original wording:** Can the acquisition withstand a market downturn at or shortly after completion?
- **Guidance:** Stress-test lower resale value, lower rent, higher costs, and longer vacancy.
- **Answer:** Number · unit `%`
- **Better:** lower
- **Method:** Calculation (`calculation`)
- **Source measures:** price decline percentage; vacancy months; local currency loss

#### 3.8.9 Capital exposure during construction `DV_RSK_CAPITAL_EXPOSED`

- **Question:** What percentage of the purchase price is committed before the apartment is legally transferable?
- **Original wording:** How much of the buyer’s capital will be committed before the apartment is legally transferable?
- **Guidance:** Map payment milestones and periods without an independently enforceable ownership right.
- **Answer:** Number · unit `%`
- **Better:** lower
- **Method:** Calculation (`calculation`)
- **Source measures:** local currency; percentage of purchase price; months exposed

#### 3.8.10 Opportunity cost during delay `DV_RSK_DELAY_COST`

- **Question:** What is the financial cost if completion is delayed by 12 months?
- **Original wording:** What is the financial cost if completion is delayed by 6, 12, or 24 months?
- **Guidance:** Include alternative rent, financing, inflation, lost rental income, and capital tied up.
- **Answer:** Number · unit `cur`
- **Better:** lower
- **Method:** Calculation (`calculation`)
- **Source measures:** months; local currency; annual percentage rate

#### 3.8.11 Currency and inflation exposure `DV_RSK_CURRENCY_EXPOSURE`

- **Question:** Is the purchase price or payment schedule exposed to currency or inflation changes?
- **Guidance:** Identify contract currency, indexation, conversion mechanism, and household income currency.
- **Answer:** Yes / no
- **Better:** no
- **Method:** Document review (`documents`)
- **Source measures:** currency; percentage change; local currency exposure

#### 3.8.12 Exit options if the project is delayed or fails `DV_RSK_EXIT_OPTIONS`

- **Question:** Can the buyer legally and practically exit, assign, or recover the investment if the project fails?
- **Guidance:** Review termination, assignment, refund security, enforcement, and expected recovery time.
- **Answer:** Yes / no
- **Better:** yes
- **Method:** Expert judgement (`expert`)
- **Source measures:** recoverable local currency; recovery period in months; documentary status
