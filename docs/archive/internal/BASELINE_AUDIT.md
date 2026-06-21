# Baseline Audit

Audit date: 2026-06-19

Status: baseline v0 invalidated, retained only for forensic comparison.

## Inputs

| Source | Normalized Vietnamese words | Normalized Han/CJK rows | Raw SHA-256 |
| --- | ---: | ---: | --- |
| `vntk_dictionary` | 31,327 | 0 | `FB41663096D6A24DE8854567E5A4C5ADED5BF39CE7BC2172D3CD0211C360C763` |
| `kaikki_viwiktionary` | 43,396 | 1,090 | `9C8D97B54DD0EC705B7ED5DB1A1AFBF3E37A8CEB561BDDE4F685F433BB7B3629` |
| `unicode_unihan` | 0 | 97,536 | `F7A48B2B545ACFAA77B2D607AE28747404CE02BAEFEE16396C5D2D7A8EF34B5E` |

## Invalidated output

- Vietnamese dictionary entries: 49,931.
- CJK entries labelled as Han/Han-Viet: 97,536.
- Word bucket files: 27.
- Han radical files: 215.
- Processed size: 75,947,934 bytes.
- Raw snapshot size: 51,714,493 bytes.
- Normalized size: 57,572,705 bytes.

## Findings

### Critical: Unihan was treated as an entry source

`normalizeUnihan()` emitted one dictionary row for nearly every Unihan record carrying radical, stroke, variant, reading or definition metadata. The merge then accepted all of those rows as Han-Viet entries.

This violated the project brief, which explicitly says Unihan is for enrichment and must not replace Vietnamese readings and meanings. It also made 214/214 radical coverage meaningless as a completeness measure: a pan-CJK Unicode inventory naturally spans all Kangxi radicals.

### Major: Han, Han-Viet and Nom were not separated

The baseline had one `han-viet` collection but no independent Nom model. A pan-CJK character, a character with a Sino-Vietnamese reading, and a Nom orthographic form could all be represented by the same shape without evidence classification.

### Major: coverage mixed dictionary entries and metadata inventory

The report placed 49,931 Vietnamese headwords beside 97,536 Unicode code points as if the two counts described comparable lexical coverage. They do not.

### Moderate: source provenance was too coarse

Definitions carried a source key, but source revision, raw record hash, review status and confidence were not preserved at fact level. Removal was possible only by rebuilding ad hoc, with no regression test proving that all source contributions disappeared.

### Moderate: no lexeme-only layer

The merge discarded entries without definitions. That avoided inflating dictionary counts, but also meant wordlist and spelling resources had no proper destination.

## Decisions

1. Baseline v0 must never be published or used for product metrics.
2. Unihan will emit metadata records only. Merge may join them only to a pre-existing Han-Viet or Nom record.
3. Vietnamese dictionary, lexeme-only, semantic, Han-Viet, Nom and corpus evidence outputs will be counted separately.
4. Every release will have a source manifest and per-fact provenance.
5. Radical coverage is descriptive only and cannot establish academic completeness.

## Regression cases retained

- Tone-sensitive headwords: `ma`, `má`, `mà`, `mả`, `mã`, `mạ` must remain distinct.
- Supplementary-plane Nom characters must survive JSON round trips.
- Disabling a source must remove all facts attributed solely to that source.
- A Unihan record without Vietnamese lexical evidence must not appear in Han-Viet or Nom output.
