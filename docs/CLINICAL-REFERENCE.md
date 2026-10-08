# Clinical reference

This app implements four WHO-aligned screening tools. This document records
the exact codes and scoring rules used in `js/scoring.js`, with citations,
and flags the places where this app simplifies the full epidemiological-survey
protocol for practical chairside/camp screening use.

Primary source: [WHO, *Oral Health Surveys: Basic Methods*, 5th edition (2013)](https://www.who.int/publications/i/item/9789241548649).
Secondary sources used to cross-check criteria are listed at the end.

## DMFT / dmft (dental caries)

- **DMFT** (uppercase) = permanent dentition, scored per tooth across all 32
  teeth (or 28, excluding third molars, in some protocols - this app charts
  all 32/20 and lets you code third molars `9 - Excluded` if you don't want
  to score them).
- **dmft** (lowercase) = primary dentition, 20 teeth.

Tooth status codes used on the chart:

| Code | Meaning | Counted as |
|---|---|---|
| 0 | Sound | - |
| 1 | Decayed | **D** |
| 2 | Filled, with decay (recurrent caries) | **D** |
| 3 | Filled, no decay | **F** |
| 4 | Missing, due to caries | **M** |
| 5 | Missing, any other reason | - |
| 6 | Fissure sealant | - |
| 7 | Bridge abutment / special crown / implant | **F** |
| 8 | Unerupted | - |
| 9 | Excluded / not recorded | - |

`DMFT total = D + M + F`. This mapping (code 7 counted as F) is a common
teaching convention; some protocols exclude code 7 from F. If your local
protocol differs, this is the one place to change it - edit `D_CODES`,
`M_CODES`, `F_CODES` at the top of `js/scoring.js`.

**Known simplification - primary teeth "missing" code:** WHO guidance notes
that a missing primary tooth is often due to normal exfoliation rather than
caries, especially in older children, so the M component for dmft should be
used cautiously. This app does not auto-suppress code 4 for primary teeth -
use clinical judgement when coding a missing primary tooth.

**Known simplification - mixed dentition:** each screening charts either the
full primary set or the full permanent set, not a true mixed chart. For a
child in transition (roughly ages 6-12) with both tooth types present, pick
whichever dentition you are scoring for that visit.

## PUFA / pufa (clinical consequences of untreated caries)

Source: Monse B, Heinrich-Weltzien R, Benzian H, Holmgren C, van Palenstein
Helderman W. [PUFA - an index of clinical consequences of untreated dental
caries](https://ojs.uomosul.edu.iq/index.php/rden/article/download/34916/34717/35020).
*International Dental Journal*, 2010.

- Scored **only** on teeth already coded Decayed (1 or 2) in the DMFT/dmft
  step - this app auto-builds that list for you.
- If no tooth is coded decayed, PUFA/pufa is skipped entirely (per the
  original protocol) and recorded as "not required", total 0.
- Visual assessment only, no probing.
- At most one code per tooth, uppercase for permanent (**PUFA**), lowercase
  for primary (**pufa**):
  - **P/p** - Pulpal involvement: visible pulp exposure, or only root
    fragments remain.
  - **U/u** - Ulceration: soft-tissue trauma from sharp fragments of a
    pulp-involved tooth.
  - **F/f** - Fistula: a draining sinus tract linked to a pulp-involved
    tooth.
  - **A/a** - Abscess: a pus-filled swelling linked to a pulp-involved
    tooth.
- Score = count of qualifying teeth (same cumulative counting as DMFT).

## CPITN / CPI (periodontal screening)

WHO renamed this the Community Periodontal Index (CPI); "CPITN" remains the
common clinical name and is used in this app's UI.

- The mouth is divided into **6 sextants**. The 10 WHO index teeth are:
  - Sextant 1 (upper right): 17, 16
  - Sextant 2 (upper anterior): 11
  - Sextant 3 (upper left): 26, 27
  - Sextant 4 (lower left): 37, 36
  - Sextant 5 (lower anterior): 31
  - Sextant 6 (lower right): 46, 47
- You may examine just these index teeth (the standard fast chairside
  method CPITN was designed for) or every tooth in the sextant and record
  the worst score (the epidemiological-survey method) - both are valid WHO
  approaches and the app just asks for one 0-4/X score per sextant.
- Use the WHO periodontal probe (ball-tipped, 0.5 mm ball, black band
  3.5-5.5 mm) where available.

| Code | Meaning |
|---|---|
| 0 | Healthy |
| 1 | Bleeding on probing |
| 2 | Calculus (supra- or subgingival) |
| 3 | Pocket 4-5 mm (black band partially visible) |
| 4 | Pocket 6 mm+ (black band disappears) |
| X | Excluded sextant (fewer than 2 teeth present) |

Treatment need is taken from the **worst non-excluded sextant score**:

| Worst score | Treatment need |
|---|---|
| 0 | TN0 - none |
| 1 | TN1 - oral hygiene instruction |
| 2 or 3 | TN2 - OHI + professional scaling |
| 4 | TN3 - OHI + scaling + complex periodontal treatment / referral |

## Oral cancer screening

Not a numeric WHO index - a structured visual and tactile exam, following
standard oral cancer screening practice (site-by-site inspection plus a
risk-factor history).

**Sites examined:** lips (extra- and intraoral), buccal/labial mucosa,
gingiva/alveolar ridge, tongue (dorsal, ventral and lateral borders - the
most common site for oral cancer), floor of mouth, hard palate, soft
palate/oropharynx/tonsillar area, and neck lymph nodes (palpation).

Look for: a non-healing ulcer (>2-3 weeks), white patch (leukoplakia), red
patch (erythroplakia), induration, a lump or swelling, abnormal bleeding,
numbness, trismus, or difficulty swallowing.

**Risk factors recorded:** smoked tobacco, smokeless/chewed tobacco, areca
nut/betel quid, alcohol use, prior oral lesion or cancer history, chronic
sun exposure (relevant to lip cancer). Age 40+ is also factored in
automatically.

**Risk flag logic (this app's own triage rule, not a WHO-defined score):**
- Any site marked abnormal -> **REFER** (suspicious finding, refer for
  specialist evaluation / biopsy).
- No abnormal site but 2+ risk factors (including age 40+) -> **HIGHER
  RISK** (reinforce cessation counselling, monitor).
- Otherwise -> **LOW RISK** (routine recall).

This flag is a screening triage aid only, never a diagnosis - the app
displays this disclaimer on the screening and review screens.

## Other sources consulted

- [CAPP - Methods and Indices, Malmö University](https://capp.mau.se/methods-and-indices/)
- [Canadian regional oral screening form reproducing WHO dmft/DMFT and PUFA/pufa criteria](https://www.sac-isc.gc.ca/DAM/DAM-ISC-SAC/DAM-FNDNG/STAGING/texte-text/oral-Screening-40-007-FILL_1591369163068_eng.pdf)
