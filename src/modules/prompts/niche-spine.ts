/**
 * Niche Spine — per-niche dramatic skeleton.
 *
 * The fixed 15-chapter architecture (`drama15-chapter-architecture.ts`) is
 * shared by every niche, and the story-bible schema hard-codes a
 * betrayal/class-shame/revenge engine trio. That combination made every niche
 * collapse onto the same skeleton — a billionaire story and a wedding-infidelity
 * story were structurally identical, only the props changed.
 *
 * A niche spine re-frames the recurring structural beats (the pressure engine,
 * the humiliation vector, the reversal engine, the ending mode, and how the
 * fixed load-bearing chapters — foreshadow ch3, reveal ch7, nadir ch9, public
 * reveal ch14 — should read) in terms native to each niche. It does NOT replace
 * the 15-chapter pacing skeleton; it changes the dramatic *content* poured into
 * it so that concept / bible / chapter-plan diverge by niche instead of reusing
 * the same "betrayal → public shame → revenge" spine everywhere.
 *
 * Shared by both the desktop orchestrator and the web API engine.
 */

export type NicheSpine = {
  /** Canonical niche id this spine belongs to. */
  linePreset: string;
  /** One-line description of the core dramatic engine unique to this niche. */
  coreEngine: string;
  /** What replaces the generic "betrayal engine" — the specific pressure. */
  pressureEngine: string;
  /** What replaces the generic "class shame engine" — the humiliation vector. */
  humiliationVector: string;
  /** What replaces the generic "revenge engine" — how the heroine reverses it. */
  reversalEngine: string;
  /** Native framing for the ch3 planted foreshadow detail. */
  foreshadowFraming: string;
  /** Native framing for the ch7 reveal beat. */
  revealFraming: string;
  /** Native framing for the ch9 no-rescue nadir. */
  nadirFraming: string;
  /** Native framing for the ch14 public-truth reveal. */
  publicRevealFraming: string;
  /** Structural anti-clichés to avoid so this niche does not drift generic. */
  avoid: string[];
};

const NICHE_SPINES: Record<string, NicheSpine> = {
  billionaire_rich_poor_romance: {
    linePreset: "billionaire_rich_poor_romance",
    coreEngine: "a class-gap love story where wealth is used as a leash, not a gift",
    pressureEngine:
      "the wealthy family weaponizes money, contracts, and social standing to keep the poor heroine dependent and deniable",
    humiliationVector:
      "public reminders of her origins — seating, dress, 'charity' framing — staged so she looks ungrateful if she objects",
    reversalEngine:
      "she proves independent worth (skill, ownership, a paper trail) so the money loses its grip and he must choose her openly or lose her",
    foreshadowFraming:
      "plant a financial/ownership detail (a signature, an account number, a clause) that looks routine now",
    revealFraming:
      "the same financial detail exposes that the relationship was transactional or pre-arranged behind her back",
    nadirFraming:
      "she is publicly recast as the outsider who does not belong to this wealth, with no ally rich enough to vouch for her",
    publicRevealFraming:
      "she produces the ownership/contract truth in front of the elite audience whose opinion the family fears most",
    avoid: [
      "secret-inheritance rescue that hands her wealth instead of earning it",
      "the rich man solving everything with a checkbook",
    ],
  },
  humiliation_revenge_justice: {
    linePreset: "humiliation_revenge_justice",
    coreEngine: "a wrongly-shamed worker who lets evidence, not outrage, deliver justice",
    pressureEngine:
      "an institution or superior scapegoats her to protect someone powerful, using politeness and procedure as cover",
    humiliationVector:
      "a staged public accusation (theft, incompetence, a doctored clip) that the crowd believes before she can speak",
    reversalEngine:
      "she matures the evidence trail — timestamps, records, a witness — until the same room that shamed her must correct the record",
    foreshadowFraming:
      "plant a record/timestamp/witness detail that seems minor at the moment of humiliation",
    revealFraming:
      "the record surfaces and reframes who actually did what, without a shouting confrontation",
    nadirFraming:
      "the accusation sticks publicly and costs her the job/name, with the real culprit still protected",
    publicRevealFraming:
      "the evidence plays in the exact venue where she was shamed, reversing the verdict procedurally",
    avoid: [
      "revenge through cruelty rather than proof",
      "a sudden confession that replaces earned evidence",
    ],
  },
  secret_identity_hidden_heiress: {
    linePreset: "secret_identity_hidden_heiress",
    coreEngine: "a powerful woman moving in disguise to expose who abuses the invisible",
    pressureEngine:
      "she must hide her true status (owner, heiress, authority) for a legal or protective reason while being treated as nobody",
    humiliationVector:
      "people who assume she is powerless order her around, mock her, or abuse her — on the record",
    reversalEngine:
      "the timed reveal of her real identity flips every prior insult into documented evidence against the abuser",
    foreshadowFraming:
      "plant an identity clue (a deference, a document, a bodyguard's caution) arrogant people ignore",
    revealFraming:
      "the clue resolves into proof of who she really is, recontextualizing earlier scenes",
    nadirFraming:
      "her cover forces her to absorb a real injustice she cannot yet answer without blowing the plan",
    publicRevealFraming:
      "she drops the disguise where the abuser is most exposed, turning their own words against them",
    avoid: [
      "identity reveal used only for a status flex with no consequence",
      "a reveal that rescues her instead of exposing the abuser's behavior",
    ],
  },
  toxic_family_betrayal: {
    linePreset: "toxic_family_betrayal",
    coreEngine: "a scapegoat child reclaiming what a family erased through paperwork and duty",
    pressureEngine:
      "relatives shift debt, deeds, and documents onto her while framing exploitation as family loyalty",
    humiliationVector:
      "she is treated as the family's obligation-bearer — expected to pay, care, and stay silent while others take credit",
    reversalEngine:
      "she uses records (deeds, ledgers, care agreements, DNA) to prove ownership and refuse the family's claim",
    foreshadowFraming:
      "plant a family document/keepsake detail that looks like ordinary domestic friction",
    revealFraming:
      "that document exposes a deliberate erasure — a forged will, hidden adoption, drained account",
    nadirFraming:
      "the family closes ranks and locks her out, weaponizing blood ties so outsiders won't intervene",
    publicRevealFraming:
      "she brings the paperwork to a family-facing forum (probate, audit, gathering) where relatives cannot spin it",
    avoid: [
      "a tidy family reconciliation that erases the accountability",
      "an outsider rescuing her from the family instead of her own records",
    ],
  },
  cheating_ex_wedding_drama: {
    linePreset: "cheating_ex_wedding_drama",
    coreEngine: "a betrayed partner who exits on her own terms before the cheater controls the story",
    pressureEngine:
      "a partner hides an affair and shared-asset entanglement, expecting her to keep face for the wedding/marriage optics",
    humiliationVector:
      "she is positioned as the replaceable one — reseated, downgraded, asked to smile — while the affair is normalized around her",
    reversalEngine:
      "she uses logistics (payment trails, venue records, timelines) to expose the affair and file first, on her schedule",
    foreshadowFraming:
      "plant a wedding/finance logistics detail (a seating change, a deposit, an invoice) that reads as routine",
    revealFraming:
      "the logistics detail dates the affair and exposes who funded what, before any confession",
    nadirFraming:
      "the betrayal goes semi-public in a way that frames her as the obstacle to everyone's happy event",
    publicRevealFraming:
      "the paper trail lands during the couple's own public moment, ending the story on her terms",
    avoid: [
      "a screaming confrontation that gives the cheater the moral high ground",
      "her waiting for an apology instead of acting on the evidence",
    ],
  },
  single_mom_poor_woman_comeback: {
    linePreset: "single_mom_poor_woman_comeback",
    coreEngine: "a single mother whose caregiving competence becomes the comeback the world underestimated",
    pressureEngine:
      "childcare, school fees, and custody threats are used to shame her poverty and prove she is 'unreliable'",
    humiliationVector:
      "she is mocked at school gates, clinics, and workplaces for the visible costs of raising a child alone",
    reversalEngine:
      "she turns proven competence (the plan she wrote, the crisis she solved, the child she protected) into leverage and standing",
    foreshadowFraming:
      "plant a child/care detail (a drawing, a clinic log, a crisis plan) that adults dismiss now",
    revealFraming:
      "that detail identifies who actually lied or who really did the work",
    nadirFraming:
      "a custody or livelihood threat arrives exactly when she is most exposed, with no safety net",
    publicRevealFraming:
      "her competence and the record are recognized in the forum that once dismissed her",
    avoid: [
      "a wealthy man rescuing her out of poverty",
      "the child used as a cute prop rather than a person with real stakes",
    ],
  },
  social_injustice_discrimination_drama: {
    linePreset: "social_injustice_discrimination_drama",
    coreEngine: "a denied-access story where documented bias becomes enforced policy change",
    pressureEngine:
      "an institution hides discrimination behind policy language, refusing service or accommodation while looking neutral",
    humiliationVector:
      "she is publicly refused, searched, or accused based on how she looks, with staff and crowd taking the easy story",
    reversalEngine:
      "she documents the violation (policy text, footage, witnesses) and forces a structural correction, not just an apology",
    foreshadowFraming:
      "plant a policy/record detail (a written rule, a camera angle, a tracking number) that seems incidental",
    revealFraming:
      "the record proves the refusal was illegal or biased, not a misunderstanding",
    nadirFraming:
      "the institution stalls and the crowd's bias wins publicly, isolating her",
    publicRevealFraming:
      "the documented violation triggers a review/inspection that changes the rule for everyone",
    avoid: [
      "cartoonish villainy instead of institutional pressure",
      "cheap outrage not grounded in a concrete documented behavior",
    ],
  },
  workplace_ceo_power_struggle: {
    linePreset: "workplace_ceo_power_struggle",
    coreEngine: "an erased contributor who reclaims authorship and standing inside a corporate power game",
    pressureEngine:
      "leadership takes her work and rank while HR process and optics are used to make her removal look clean",
    humiliationVector:
      "she is publicly downgraded — cut from the deck, the photo, the room — as if she were replaceable",
    reversalEngine:
      "she proves authorship and value (repository history, logs, the plan that saved the deal) and takes back position by vote or ownership",
    foreshadowFraming:
      "plant a work-artifact detail (a file history, a Slack log, a cap-table line) that looks like ordinary process",
    revealFraming:
      "the artifact proves who really built or decided what, exposing the theft",
    nadirFraming:
      "she is fired/erased publicly right before the moment the company needs exactly what she owns",
    publicRevealFraming:
      "the evidence lands in a boardroom/investor forum where authorship translates directly into power",
    avoid: [
      "a mentor handing her the win instead of her own proof",
      "romance resolving the power struggle in place of leverage",
    ],
  },
  medical_hidden_doctor_life_care: {
    linePreset: "medical_hidden_doctor_life_care",
    coreEngine: "a dismissed medical professional whose competence and records protect patient dignity",
    pressureEngine:
      "a hospital bends rules around consent, triage, and access to protect donors and status, treating care labor as low",
    humiliationVector:
      "she is treated as unqualified or disposable — charity case, 'just a nurse' — until a life depends on her",
    reversalEngine:
      "she uses medical records (charts, consent metadata, medication logs) to expose the cover-up and restore correct care",
    foreshadowFraming:
      "plant a clinical-record detail (a chart timestamp, a consent form, a med log) that seems procedural",
    revealFraming:
      "the record proves who made the lifesaving call or who manipulated consent",
    nadirFraming:
      "she loses her badge/standing for doing right, while the institution protects the powerful family",
    publicRevealFraming:
      "the record surfaces in an ethics/board review that vindicates her and fixes the unsafe rule",
    avoid: [
      "miracle medicine or a dramatic last-second cure as the resolution",
      "the reveal centered on romance instead of patient dignity",
    ],
  },
  school_campus_bullying_identity: {
    linePreset: "school_campus_bullying_identity",
    coreEngine: "a bullied student whose merit and hidden standing dismantle a rigged campus hierarchy",
    pressureEngine:
      "donor money and cliques bend school discipline, rankings, and adults against a lower-status student",
    humiliationVector:
      "she is mocked for scholarship/origin, framed for cheating, or erased from teams and photos",
    reversalEngine:
      "she uses records (exam metadata, scholarship ledgers, CCTV, group chats) to prove merit and expose the rigging",
    foreshadowFraming:
      "plant a campus-record detail (a file history, a ledger, a chat archive) that reads as normal school friction",
    revealFraming:
      "the record proves the accusation was staged or the credit was stolen",
    nadirFraming:
      "adults side with the powerful student and the punishment lands on her publicly",
    publicRevealFraming:
      "the record is heard at an assembly/committee where merit and safety are restored on the record",
    avoid: [
      "a generic bully-apology ending with no structural change",
      "hidden identity used only as a status flex, not to protect someone",
    ],
  },
  werewolf_luna_alpha_soulmate: {
    linePreset: "werewolf_luna_alpha_soulmate",
    coreEngine: "a rejected mate who claims authority through pack law before she accepts love",
    pressureEngine:
      "the mate bond and pack hierarchy are used to control or reject her, treating the bond as obligation not consent",
    humiliationVector:
      "she is publicly rejected, ranked below, or denied her place as Luna before the pack",
    reversalEngine:
      "she uses pack law, scent proof, oaths, and rites to force recognition on her own terms",
    foreshadowFraming:
      "plant a bond/scent/oath detail that the arrogant Alpha or rival dismisses",
    revealFraming:
      "the detail proves the true bond or a broken oath, reframing the rejection",
    nadirFraming:
      "the rejection is ratified by pack ritual and she stands with no protector",
    publicRevealFraming:
      "she claims her standing at a pack rite where the law itself validates her over the rejecter",
    avoid: [
      "the mate bond forcing consent as if it were automatic love",
      "Luna power treated as decorative rather than political and protective",
    ],
  },
  steamy_alien_captive_romance: {
    linePreset: "steamy_alien_captive_romance",
    coreEngine: "a captive who renegotiates freedom and terms before any bond is real",
    pressureEngine:
      "an empire's ownership contract and hierarchy treat her as property, with possession mistaken for loyalty",
    humiliationVector:
      "she is claimed, collared, or auctioned, expected to submit to a ruler's authority in public",
    reversalEngine:
      "she uses the empire's own law, mistranslation, or contract clauses to void coercion and set her own terms",
    foreshadowFraming:
      "plant a law/contract/collar-code detail that looks like fixed imperial rule",
    revealFraming:
      "the detail exposes that the claim was illegal or coerced under the empire's own code",
    nadirFraming:
      "the contract is enforced publicly and she is stripped of standing with no ally in the court",
    publicRevealFraming:
      "she voids the coercive contract in the ruler's own court, forcing equal terms",
    avoid: [
      "captivity romanticized without a real consent/agency arc",
      "the ruler's power solving the conflict instead of her leverage",
    ],
  },
};

const FALLBACK_NICHE_SPINE = NICHE_SPINES.billionaire_rich_poor_romance as NicheSpine;

/**
 * Resolve the niche spine for a configured niche id. Falls back to the
 * billionaire spine (the richest, canonical one) for custom/unknown branches so
 * the prompt always has a coherent dramatic skeleton to work from.
 */
export function resolveNicheSpine(linePreset: string): NicheSpine {
  return NICHE_SPINES[linePreset] ?? FALLBACK_NICHE_SPINE;
}

/**
 * Render the niche spine as a prompt block body. Frames the recurring
 * load-bearing beats in niche-native terms so concept / bible / chapter-plan
 * stop reusing the generic betrayal→shame→revenge skeleton across niches.
 */
export function renderNicheSpineForPrompt(spine: NicheSpine): string {
  return [
    `Core dramatic engine: ${spine.coreEngine}.`,
    `Pressure engine (use instead of a generic betrayal engine): ${spine.pressureEngine}.`,
    `Humiliation vector (use instead of a generic class-shame engine): ${spine.humiliationVector}.`,
    `Reversal engine (use instead of a generic revenge engine): ${spine.reversalEngine}.`,
    "Frame the fixed structural beats in this niche's own terms:",
    `- Chapter 3 foreshadow: ${spine.foreshadowFraming}.`,
    `- Chapter 7 reveal: ${spine.revealFraming}.`,
    `- Chapter 9 no-rescue nadir: ${spine.nadirFraming}.`,
    `- Chapter 14 public reveal: ${spine.publicRevealFraming}.`,
    `Avoid these niche clichés: ${spine.avoid.join("; ")}.`,
  ].join("\n");
}
