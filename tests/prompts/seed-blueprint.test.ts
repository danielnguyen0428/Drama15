import assert from "node:assert/strict";
import test from "node:test";

import {
  createSeedBlueprint,
  getSeedBlueprintBankDiagnostics,
  renderRecentSeedHistoryForPrompt,
  renderSeedBlueprintForPrompt,
  type SeedHistoryEntry,
} from "../../src/modules/prompts/seed-blueprint";

test("createSeedBlueprint returns niche-specific story atoms and a stable fingerprint", () => {
  const blueprint = createSeedBlueprint({
    linePreset: "billionaire_rich_poor_romance",
    random: () => 0,
  });

  assert.equal(blueprint.linePreset, "billionaire_rich_poor_romance");
  assert.match(blueprint.topicAnchor, /Poor Girl|Rich Boy|Heir|Cinderella|Billionaire|Maid|Scholarship|Tutor|Caregiver|Delivery|Florist/);
  assert.match(blueprint.motifFamily, /heir|rich|poor|class|love|romance|courtship|family/i);
  assert.match(blueprint.arena, /\S/);
  assert.match(blueprint.socialPain, /family|class|donor|elite|service|arranged|gala/i);
  assert.match(blueprint.hiddenLeverage, /letter|diary|sketchbook|testimony|character|grandmother|vow|kindness|resignation|engagement|patron|seating chart|guest book/i);
  assert.match(blueprint.fingerprint, /^billionaire_rich_poor_romance\|/);
});

test("createSeedBlueprint avoids recent fingerprints even with the same random source", () => {
  const first = createSeedBlueprint({
    linePreset: "billionaire_rich_poor_romance",
    random: () => 0,
  });
  const second = createSeedBlueprint({
    linePreset: "billionaire_rich_poor_romance",
    random: () => 0,
    history: [
      {
        fingerprint: first.fingerprint,
        linePreset: first.linePreset,
        titleHint: "Poor Bride Contract",
        createdAt: "2026-05-02T00:00:00.000Z",
      },
    ],
  });

  assert.notEqual(second.fingerprint, first.fingerprint);
  assert.notEqual(second.topicAnchor, first.topicAnchor);
  assert.notEqual(second.hiddenLeverage, first.hiddenLeverage);
});

test("createSeedBlueprint gives billionaire auto-generation broader anchors than fake-wife repetition", () => {
  let history: SeedHistoryEntry[] = [];
  const anchors = new Set<string>();

  for (let index = 0; index < 6; index += 1) {
    const blueprint = createSeedBlueprint({
      linePreset: "billionaire_rich_poor_romance",
      random: () => 0,
      history,
    });

    anchors.add(blueprint.topicAnchor);
    history = [
      {
        fingerprint: blueprint.fingerprint,
        linePreset: blueprint.linePreset,
        titleHint: blueprint.topicAnchor,
        createdAt: `2026-05-02T00:00:0${index}.000Z`,
        blueprint,
      },
      ...history,
    ];
  }

  assert.equal(anchors.size >= 5, true);
  assert.equal(
    [...anchors].some((anchor) => /Heir|Cinderella|Tutor|Maid|Scholarship|Caregiver|Florist|Delivery|Charity Gala|Poor Bride|Rich Boy|Poor Boy|Rich Girl/i.test(anchor)),
    true,
  );
});

test("createSeedBlueprint adds skeleton-level diversity beyond the topic anchor", () => {
  const blueprint = createSeedBlueprint({
    linePreset: "billionaire_rich_poor_romance",
    random: () => 0,
  }) as unknown as Record<string, string>;

  assert.equal(typeof blueprint.relationshipDynamic, "string");
  assert.equal(typeof blueprint.protagonistAgency, "string");
  assert.equal(typeof blueprint.antagonistWeb, "string");
  assert.equal(typeof blueprint.revealMechanism, "string");
  assert.equal(typeof blueprint.endingShape, "string");
  assert.match(blueprint.relationshipDynamic, /\S/);
  assert.match(blueprint.protagonistAgency, /\S/);
  assert.match(blueprint.antagonistWeb, /\S/);
  assert.match(blueprint.revealMechanism, /\S/);
  assert.match(blueprint.endingShape, /\S/);
});

test("billionaire niche rotates relationship, reveal, agency, and ending shapes with recent history", () => {
  let history: SeedHistoryEntry[] = [];
  const relationshipDynamics = new Set<string>();
  const revealMechanisms = new Set<string>();
  const protagonistAgencies = new Set<string>();
  const endingShapes = new Set<string>();

  for (let index = 0; index < 18; index += 1) {
    const blueprint = createSeedBlueprint({
      linePreset: "billionaire_rich_poor_romance",
      random: () => 0,
      history,
    });

    relationshipDynamics.add((blueprint as unknown as Record<string, string>).relationshipDynamic);
    revealMechanisms.add((blueprint as unknown as Record<string, string>).revealMechanism);
    protagonistAgencies.add((blueprint as unknown as Record<string, string>).protagonistAgency);
    endingShapes.add((blueprint as unknown as Record<string, string>).endingShape);
    history = [
      {
        fingerprint: blueprint.fingerprint,
        linePreset: blueprint.linePreset,
        titleHint: blueprint.topicAnchor,
        createdAt: `2026-05-04T01:00:${String(index).padStart(2, "0")}.000Z`,
        blueprint,
      },
      ...history,
    ];
  }

  assert.equal(relationshipDynamics.size >= 10, true, `only ${relationshipDynamics.size} relationship shapes`);
  assert.equal(revealMechanisms.size >= 10, true, `only ${revealMechanisms.size} reveal mechanisms`);
  assert.equal(protagonistAgencies.size >= 10, true, `only ${protagonistAgencies.size} agency patterns`);
  assert.equal(endingShapes.size >= 10, true, `only ${endingShapes.size} ending shapes`);
  assert.equal(
    [...endingShapes].some((shape) => /apology/i.test(shape)),
    false,
    "ending shapes should not depend on a default apology finish",
  );
});

test("createSeedBlueprint tolerates legacy history blueprints without skeleton fields", () => {
  const legacyBlueprint = createSeedBlueprint({
    linePreset: "billionaire_rich_poor_romance",
    random: () => 0,
  }) as unknown as Record<string, string>;
  delete legacyBlueprint.relationshipDynamic;
  delete legacyBlueprint.protagonistAgency;
  delete legacyBlueprint.antagonistWeb;
  delete legacyBlueprint.revealMechanism;
  delete legacyBlueprint.endingShape;

  const blueprint = createSeedBlueprint({
    linePreset: "billionaire_rich_poor_romance",
    random: () => 0,
    history: [
      {
        fingerprint: legacyBlueprint.fingerprint,
        linePreset: legacyBlueprint.linePreset,
        titleHint: "Legacy Poor Bride",
        createdAt: "2026-05-04T00:00:00.000Z",
        blueprint: legacyBlueprint as unknown as SeedHistoryEntry["blueprint"],
      },
    ],
  });

  assert.match(blueprint.fingerprint, /^billionaire_rich_poor_romance\|/);
  assert.match(blueprint.relationshipDynamic, /\S/);
  assert.match(blueprint.endingShape, /\S/);
});

test("each niche has its own skeleton vocabulary instead of a shared generic spine", () => {
  const expectedVocabulary: Record<string, RegExp> = {
    billionaire_rich_poor_romance: /billionaire|bride|heir|tycoon|patent|romance|old-money/i,
    humiliation_revenge_justice: /humiliation|mocked|manager|receipt|viral|disciplinary|record|justice/i,
    secret_identity_hidden_heiress: /identity|undercover|heiress|alias|audit|bodyguard|owner|reveal/i,
    toxic_family_betrayal: /inheritance|will|probate|funeral|sibling|mother|deed|family/i,
    cheating_ex_wedding_drama: /affair|mistress|wedding|divorce|custody|prenup|ex|bride/i,
    single_mom_poor_woman_comeback: /single mother|child|custody|school|clinic|babysitter|father|comeback/i,
    social_injustice_discrimination_drama: /discrimination|accessibility|policy|complaint|service refusal|inspector|witness|bias/i,
    workplace_ceo_power_struggle: /workplace|office|CEO|startup|board|pitch|layoff|HR|audit|cap table/i,
    medical_hidden_doctor_life_care: /doctor|nurse|clinic|patient|triage|surgery|consent|chart|medical|care/i,
    school_campus_bullying_identity: /school|campus|student|bully|scholarship|teacher|dorm|exam|principal|bodyguard/i,
    werewolf_luna_alpha_soulmate: /werewolf|Luna|Alpha|pack|mate|moon|soulmate|second chance|love triangle/i,
    steamy_alien_captive_romance: /alien|captive|dominant|sensual|ship|planet|collar|commander|consent|agency/i,
  };
  const signatures = new Map<string, string>();

  for (const { linePreset } of getSeedBlueprintBankDiagnostics()) {
    const blueprint = createSeedBlueprint({
      linePreset,
      random: () => 0,
    });
    const skeletonText = [
      blueprint.relationshipDynamic,
      blueprint.protagonistAgency,
      blueprint.antagonistWeb,
      blueprint.revealMechanism,
      blueprint.endingShape,
    ].join(" | ");

    assert.match(skeletonText, expectedVocabulary[linePreset] ?? /\S/, `${linePreset} skeleton is too generic`);
    signatures.set(linePreset, skeletonText);
  }

  assert.equal(new Set(signatures.values()).size, signatures.size, "niches should not share the same skeleton signature");
});

test("every drama niche has a broad context bank beyond hospital and wedding rooms", () => {
  const diagnostics = getSeedBlueprintBankDiagnostics();

  for (const diagnostic of diagnostics) {
    const contextDiagnostic = diagnostic as unknown as Record<string, number | string>;
    assert.equal(Number(contextDiagnostic.arenaCount) >= 12, true, `${diagnostic.linePreset} has too few arenas`);
    assert.equal(
      Number(contextDiagnostic.uniqueArenaCount),
      Number(contextDiagnostic.arenaCount),
      `${diagnostic.linePreset} has duplicate arenas`,
    );
    assert.equal(
      Number(contextDiagnostic.publicRevealVenueCount) >= 12,
      true,
      `${diagnostic.linePreset} has too few reveal venues`,
    );
    assert.equal(
      Number(contextDiagnostic.uniquePublicRevealVenueCount),
      Number(contextDiagnostic.publicRevealVenueCount),
      `${diagnostic.linePreset} has duplicate reveal venues`,
    );
  }
});

test("every drama niche has at least 20 distinct script motif families", () => {
  const diagnostics = getSeedBlueprintBankDiagnostics();

  for (const diagnostic of diagnostics) {
    const motifDiagnostic = diagnostic as unknown as Record<string, number | string>;
    assert.equal(
      Number(motifDiagnostic.motifFamilyCount) >= 20,
      true,
      `${diagnostic.linePreset} has too few script motif families`,
    );
    assert.equal(
      Number(motifDiagnostic.uniqueMotifFamilyCount),
      Number(motifDiagnostic.motifFamilyCount),
      `${diagnostic.linePreset} has duplicate script motif families`,
    );
  }
});

test("createSeedBlueprint rotates through at least 20 script motif families per niche", () => {
  for (const { linePreset } of getSeedBlueprintBankDiagnostics()) {
    let history: SeedHistoryEntry[] = [];
    const motifFamilies = new Set<string>();

    for (let index = 0; index < 26; index += 1) {
      const blueprint = createSeedBlueprint({
        linePreset,
        random: () => 0,
        history,
      });

      motifFamilies.add(blueprint.motifFamily);
      history = [
        {
          fingerprint: blueprint.fingerprint,
          linePreset: blueprint.linePreset,
          titleHint: blueprint.topicAnchor,
          createdAt: `2026-05-05T02:00:${String(index).padStart(2, "0")}.000Z`,
          blueprint,
        },
        ...history,
      ];
    }

    assert.equal(
      motifFamilies.size >= 20,
      true,
      `${linePreset} rotated only ${motifFamilies.size} script motif families`,
    );
  }
});

test("toxic family niche does not default to funeral, hospital, or probate contexts", () => {
  const blueprint = createSeedBlueprint({
    linePreset: "toxic_family_betrayal",
    random: () => 0,
  });
  const contextText = [
    blueprint.arena,
    blueprint.publicRevealVenue,
    blueprint.incitingHumiliation,
    blueprint.hiddenLeverage,
    blueprint.evidenceObject,
    blueprint.relationshipDynamic,
    blueprint.revealMechanism,
  ].join(" | ");

  assert.doesNotMatch(contextText, /\b(funeral|memorial|hospital|probate|will|widow|condolence|burial)\b/i);
});

test("toxic family niche rotates through everyday family betrayal settings before death-adjacent settings", () => {
  let history: SeedHistoryEntry[] = [];
  const contexts: string[] = [];

  for (let index = 0; index < 12; index += 1) {
    const blueprint = createSeedBlueprint({
      linePreset: "toxic_family_betrayal",
      random: () => 0,
      history,
    });
    contexts.push([
      blueprint.arena,
      blueprint.publicRevealVenue,
      blueprint.incitingHumiliation,
      blueprint.hiddenLeverage,
      blueprint.evidenceObject,
      blueprint.relationshipDynamic,
      blueprint.revealMechanism,
    ].join(" | "));
    history = [
      {
        fingerprint: blueprint.fingerprint,
        linePreset: blueprint.linePreset,
        titleHint: blueprint.topicAnchor,
        createdAt: `2026-05-05T01:00:${String(index).padStart(2, "0")}.000Z`,
        blueprint,
      },
      ...history,
    ];
  }

  const deathAdjacentContexts = contexts.filter((context) =>
    /\b(funeral|memorial|hospital|probate|will|widow|condolence|burial)\b/i.test(context),
  );
  assert.equal(
    deathAdjacentContexts.length <= 1,
    true,
    `too many death-adjacent toxic-family contexts: ${deathAdjacentContexts.join(" || ")}`,
  );
  assert.equal(
    contexts.some((context) => /family business|school|bank|apartment|utility|elder-care|tax|loan|small-claims|deed/i.test(context)),
    true,
    "toxic-family rotation should include everyday family betrayal settings",
  );
});

test("createSeedBlueprint rotates context arenas and reveal venues per niche", () => {
  for (const { linePreset } of getSeedBlueprintBankDiagnostics()) {
    let history: SeedHistoryEntry[] = [];
    const arenas = new Set<string>();
    const revealVenues = new Set<string>();

    for (let index = 0; index < 24; index += 1) {
      const blueprint = createSeedBlueprint({
        linePreset,
        random: () => 0,
        history,
      });
      arenas.add(blueprint.arena);
      revealVenues.add(blueprint.publicRevealVenue);
      history = [
        {
          fingerprint: blueprint.fingerprint,
          linePreset: blueprint.linePreset,
          titleHint: blueprint.topicAnchor,
          createdAt: `2026-05-05T00:00:${String(index).padStart(2, "0")}.000Z`,
          blueprint,
        },
        ...history,
      ];
    }

    assert.equal(arenas.size >= 12, true, `${linePreset} rotated only ${arenas.size} arenas`);
    assert.equal(revealVenues.size >= 12, true, `${linePreset} rotated only ${revealVenues.size} reveal venues`);
  }
});

test("every drama niche has at least 30 unique hot motif anchors", () => {
  const diagnostics = getSeedBlueprintBankDiagnostics();

  assert.equal(diagnostics.length, 12);
  for (const diagnostic of diagnostics) {
    assert.equal(
      diagnostic.topicAnchorCount >= 30,
      true,
      `${diagnostic.linePreset} only has ${diagnostic.topicAnchorCount} topic anchors`,
    );
    assert.equal(
      diagnostic.uniqueTopicAnchorCount,
      diagnostic.topicAnchorCount,
      `${diagnostic.linePreset} has duplicate topic anchors`,
    );
    const richDiagnostic = diagnostic as unknown as Record<string, number | string>;
    assert.equal(
      Number(richDiagnostic.relationshipDynamicCount) >= 8,
      true,
      `${diagnostic.linePreset} has too few relationship dynamics`,
    );
    assert.equal(
      Number(richDiagnostic.protagonistAgencyCount) >= 8,
      true,
      `${diagnostic.linePreset} has too few protagonist agency patterns`,
    );
    assert.equal(
      Number(richDiagnostic.antagonistWebCount) >= 8,
      true,
      `${diagnostic.linePreset} has too few antagonist webs`,
    );
    assert.equal(
      Number(richDiagnostic.revealMechanismCount) >= 8,
      true,
      `${diagnostic.linePreset} has too few reveal mechanisms`,
    );
    assert.equal(
      Number(richDiagnostic.endingShapeCount) >= 8,
      true,
      `${diagnostic.linePreset} has too few ending shapes`,
    );
  }
});

test("billionaire niche has expanded rich-poor romance seed coverage focused on courtship and class gap", () => {
  const diagnostic = getSeedBlueprintBankDiagnostics().find(
    (entry) => entry.linePreset === "billionaire_rich_poor_romance",
  );
  assert.ok(diagnostic);
  assert.equal(diagnostic.topicAnchorCount >= 40, true, `only ${diagnostic.topicAnchorCount} billionaire anchors`);

  let history: SeedHistoryEntry[] = [];
  const generatedText: string[] = [];
  for (let index = 0; index < 90; index += 1) {
    const blueprint = createSeedBlueprint({
      linePreset: "billionaire_rich_poor_romance",
      random: () => 0,
      history,
    });
    generatedText.push(JSON.stringify(blueprint));
    history = [
      {
        fingerprint: blueprint.fingerprint,
        linePreset: blueprint.linePreset,
        titleHint: blueprint.topicAnchor,
        createdAt: `2026-05-07T00:00:${String(index).padStart(2, "0")}.000Z`,
        blueprint,
      },
      ...history,
    ];
  }

  const corpus = generatedText.join("\n");
  // rich-poor courtship DNA must surface
  [
    /heir|billionaire|tycoon|rich|old-money/i,
    /poor|scholarship|caregiver|tutor|maid|delivery|baker|florist|mechanic|village/i,
    /family opposition|elite mother|family hates|family veto|donor|service entrance|arranged match/i,
    /first meeting|misunderstand|slow-burn|confession|rung động|dằn vặt|courtship/i,
    /Cinderella|charity gala|hidden heir|hidden identity/i,
    /chooses her|public choice|publicly defend|stands up to his family|publicly cancels/i,
  ].forEach((pattern) => {
    assert.match(corpus, pattern);
  });

  // CEO contract / divorce / secret-baby drama must NOT dominate this niche anymore
  assert.doesNotMatch(corpus, /contract wife/i);
  assert.doesNotMatch(corpus, /paper marriage/i);
  assert.doesNotMatch(corpus, /pregnant secretary/i);
  assert.doesNotMatch(corpus, /ex-wife divorce regret|female billionaire comeback/i);
});

test("existing non-billionaire niches generate FictionMe-category seed coverage", () => {
  const expectations: Record<string, RegExp[]> = {
    humiliation_revenge_justice: [/urban|public/i, /thriller|lawsuit|evidence|viral|apology/i],
    secret_identity_hidden_heiress: [/romance|identity/i, /undercover|hidden heiress|lost daughter|secret owner/i],
    toxic_family_betrayal: [/family|mother-in-law/i, /inheritance|custody|adoption|deed|fraud/i],
    cheating_ex_wedding_drama: [/romance|wedding/i, /dark romance|mistress|ex-wife|divorce|wedding reveal/i],
    single_mom_poor_woman_comeback: [/romance|single mom/i, /secret child|custody|daycare|comeback/i],
    social_injustice_discrimination_drama: [/urban|institution/i, /discrimination|accessibility|racism|classism|evidence/i],
    workplace_ceo_power_struggle: [
      /CEO|board/i,
      /urban|cap table|hostile takeover|pitch theft/i,
      /contract wife|paper marriage|business deal/i,
      /pregnant secretary|secret baby|surrogate/i,
      /ex-wife|divorce|female billionaire|revenge queen/i,
    ],
    medical_hidden_doctor_life_care: [/medical|hospital/i, /romance|thriller|hidden surgeon|malpractice|chart audit/i],
    school_campus_bullying_identity: [/young adult|campus/i, /scholarship|bullying|rich clique|donor parent|talent show/i],
    werewolf_luna_alpha_soulmate: [/werewolf|pack/i, /rejected mate|fated mate|Omega|pack law|Luna/i],
    steamy_alien_captive_romance: [/steamy|alien/i, /dark romance|captive heroine|empire contract|consent restoration/i],
  };

  const diagnostics = getSeedBlueprintBankDiagnostics();

  for (const [linePreset, patterns] of Object.entries(expectations)) {
    const diagnostic = diagnostics.find((entry) => entry.linePreset === linePreset);
    assert.ok(diagnostic, `${linePreset} diagnostics missing`);
    assert.equal(diagnostic.topicAnchorCount >= 36, true, `only ${diagnostic.topicAnchorCount} anchors for ${linePreset}`);

    let history: SeedHistoryEntry[] = [];
    const generatedText: string[] = [];
    for (let index = 0; index < 55; index += 1) {
      const blueprint = createSeedBlueprint({
        linePreset,
        random: () => 0,
        history,
      });
      generatedText.push(JSON.stringify(blueprint));
      history = [
        {
          fingerprint: blueprint.fingerprint,
          linePreset: blueprint.linePreset,
          titleHint: blueprint.topicAnchor,
          createdAt: `2026-05-07T01:00:${String(index).padStart(2, "0")}.000Z`,
          blueprint,
        },
        ...history,
      ];
    }

    const corpus = generatedText.join("\n");
    for (const pattern of patterns) {
      assert.match(corpus, pattern, `${linePreset} generated corpus is missing ${pattern}`);
    }
  }
});

test("createSeedBlueprint can rotate through at least 30 motif anchors per niche with history avoidance", () => {
  for (const { linePreset } of getSeedBlueprintBankDiagnostics()) {
    let history: SeedHistoryEntry[] = [];
    const anchors = new Set<string>();

    for (let index = 0; index < 35; index += 1) {
      const blueprint = createSeedBlueprint({
        linePreset,
        random: () => 0,
        history,
      });
      anchors.add(blueprint.topicAnchor);
      history = [
        {
          fingerprint: blueprint.fingerprint,
          linePreset: blueprint.linePreset,
          titleHint: blueprint.topicAnchor,
          createdAt: `2026-05-04T00:00:${String(index).padStart(2, "0")}.000Z`,
          blueprint,
        },
        ...history,
      ];
    }

    assert.equal(anchors.size >= 30, true, `${linePreset} rotated only ${anchors.size} anchors`);
  }
});

test("seed blueprint prompt render includes atoms and recent history compactly", () => {
  const blueprint = createSeedBlueprint({
    linePreset: "toxic_family_betrayal",
    random: () => 0,
  });
  const history: SeedHistoryEntry[] = [
    {
      fingerprint: blueprint.fingerprint,
      linePreset: blueprint.linePreset,
      titleHint: "The Stolen Will",
      createdAt: "2026-05-02T00:00:00.000Z",
    },
  ];

  assert.match(renderSeedBlueprintForPrompt(blueprint), /Seed blueprint selected by app/);
  assert.match(renderSeedBlueprintForPrompt(blueprint), /topicAnchor/);
  assert.match(renderSeedBlueprintForPrompt(blueprint), /publicRevealVenue/);
  assert.match(renderSeedBlueprintForPrompt(blueprint), /endingShape/);
  assert.match(renderSeedBlueprintForPrompt(blueprint), /relationshipDynamic/);
  assert.match(renderRecentSeedHistoryForPrompt(history), /The Stolen Will/);
  assert.match(renderRecentSeedHistoryForPrompt(history), /fingerprint/);
  assert.match(renderRecentSeedHistoryForPrompt([{ ...history[0], blueprint }]), /endingShape/);
  assert.match(renderRecentSeedHistoryForPrompt([{ ...history[0], blueprint }]), /revealMechanism/);
});
