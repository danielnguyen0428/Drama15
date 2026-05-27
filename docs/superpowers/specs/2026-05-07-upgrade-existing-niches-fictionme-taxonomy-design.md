# Upgrade Existing Niches To FictionMe Taxonomy Design

## Goal

Upgrade the 11 existing non-billionaire drama niches so their preset DNA, title examples, motif anchors, seed blueprints, and prompt catalogs reflect practical FictionMe category patterns without adding new niche ids or changing the current UI structure.

## Source Taxonomy

Use FictionMe's visible genre/category model as market direction: Werewolf, Billionaire/CEO, Dark Romance, Mafia, Paranormal, Romance, Fantasy, Steamy, Young Adult, Thriller, LGBTQ+, and Urban. The existing app keeps its 12 configured niches; each niche receives the closest market DNA from this taxonomy instead of being renamed into those categories.

## Scope

Niche 1 `billionaire_rich_poor_romance` is already upgraded and remains unchanged except for compatibility if tests require it. The work targets:

- `humiliation_revenge_justice`
- `secret_identity_hidden_heiress`
- `toxic_family_betrayal`
- `cheating_ex_wedding_drama`
- `single_mom_poor_woman_comeback`
- `social_injustice_discrimination_drama`
- `workplace_ceo_power_struggle`
- `medical_hidden_doctor_life_care`
- `school_campus_bullying_identity`
- `werewolf_luna_alpha_soulmate`
- `steamy_alien_captive_romance`

No new niche files, ids, dropdown choices, or UI routes will be added.

## Category Mapping

- `humiliation_revenge_justice`: Urban + Thriller justice. Public humiliation, viral evidence, class/service discrimination, lawsuit pressure, public apology, status reversal.
- `secret_identity_hidden_heiress`: Romance + Urban identity reveal with light Paranormal/Fantasy-compatible identity language only where generic. Hidden heiress, undercover boss, secret owner, lost daughter, fake poverty, public identity proof.
- `toxic_family_betrayal`: Romance + Thriller family betrayal. Inheritance theft, adoption papers, custody leverage, mother-in-law pressure, sibling fraud, property deeds, medical care duty.
- `cheating_ex_wedding_drama`: Romance + Dark Romance. Mistress conflict, ex-wife regret, runaway wedding, replacement bride, divorce papers, revenge marriage, public wedding reveal.
- `single_mom_poor_woman_comeback`: Romance + Urban comeback. Secret child, custody threat, poverty shame, hidden skill, work survival, school/daycare pressure, late regret.
- `social_injustice_discrimination_drama`: Urban + Thriller. Racism/classism/disability discrimination, service refusal, institutional mistreatment, bystander video, formal complaint, evidence reveal.
- `workplace_ceo_power_struggle`: Billionaire/CEO + Urban career power. Boss/assistant pressure, pitch theft, layoffs, hostile takeover, cap table fraud, boardroom evidence.
- `medical_hidden_doctor_life_care`: Romance + Thriller medical. Hidden surgeon, VIP patient politics, malpractice cover-up, consent, triage, chart audit, emergency reveal.
- `school_campus_bullying_identity`: Young Adult. Scholarship girl, rich clique, campus ranking, talent show, bodyguard reveal, donor parent, dorm bullying, transfer student identity.
- `werewolf_luna_alpha_soulmate`: Werewolf. Rejected mate, fated mate, Alpha/Luna/Omega hierarchy, rogue pack, pack law, second chance, love triangle, mate-bond rejection.
- `steamy_alien_captive_romance`: Steamy + Dark Romance + Fantasy sci-fi. Dominant alien ruler, captive heroine, possessive tension, empire contract, forced proximity, consent restoration, agency recovery.

## Data Changes

For each target niche:

- Expand the line preset JSON with taxonomy-aligned description, keywords, examples, and trope weights while preserving display name and id.
- Add enough original `HOT_MOTIF_ANCHORS` entries to cover the mapped category DNA and reduce repeated story skeletons.
- Expand `seed-blueprint.ts` banks so the generated setting seed rotates through category-specific arenas, humiliations, evidence objects, social forces, reveal venues, relationship dynamics, protagonist agency, antagonist webs, reveal mechanisms, and ending shapes.
- Expand `drama15-seed-engine.ts` market signal packs so trend-aware generation has practical current-demand language and title shapes.
- Expand `AUTO_GENERATE_TOPIC_CATALOG` in `story-prompts.ts` with original FictionMe-like title shapes for each mapped category.

## Testing

Add tests before production edits:

- Preset coverage tests assert each niche contains its mapped category DNA.
- Seed blueprint tests assert each target niche has broad category-specific generated coverage and enough anchors.
- Story prompt tests assert the auto-generation topic catalog includes representative original title shapes from the upgraded categories.

Verification commands:

```powershell
node --test --import tsx .\tests\presets\drama-branch-presets.test.ts .\tests\prompts\seed-blueprint.test.ts .\tests\prompts\story-prompts.test.ts
npm run check
```

## Constraints

- Do not copy FictionMe titles or plots; use category grammar and trope patterns only.
- Do not add new configured niche ids in this pass.
- Do not remove the existing Vietnamese display names or legacy concept coverage.
- Keep adult/steamy alien content adult-only and agency/consent-aware.
- Keep Werewolf genre-specific rather than generic paranormal romance.
- Keep school/campus niche Young Adult in pressure and setting, avoiding explicit adult content.

## Success Criteria

- All 11 non-billionaire niches have visibly broader, practical market DNA.
- Title generation no longer collapses into a few old generic revenge/class-shame skeletons.
- Existing Niche 1 behavior remains intact.
- Targeted tests and full `npm run check` pass.
