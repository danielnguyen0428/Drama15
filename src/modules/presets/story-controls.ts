export type StoryControlOption = {
  value: string;
  label: string;
  prompt: string;
};

export type NicheStoryControls = {
  betrayalType: StoryControlOption[];
  shameType: StoryControlOption[];
  revengeMode: StoryControlOption[];
  endingMode: StoryControlOption[];
};

export type StoryControlsByNiche = Record<string, NicheStoryControls>;

export const NICHE_STORY_CONTROLS = {
  billionaire_rich_poor_romance: {
    betrayalType: [
      storyOption("rich_family_hates_poor_bride", "Rich family hates her", "rich family hates her because she is poor, then realizes she is the only person who loved their son or daughter for who they are, not for the wealth."),
      storyOption("poor_girl_rich_boy_rejection", "Poor girl, rich boy rejection", "poor girl rich boy romance where he hesitates to defend her from elite family contempt before learning what he is about to lose."),
      storyOption("poor_boy_loved_by_rich_girl", "Poor boy loved by rich girl", "poor boy is loved by a rich girl whose family treats him as unsuitable until he refuses to compete with money for her."),
      storyOption("hidden_heir_first_love_test", "Hidden heir first-love test", "hidden heir hides his wealth so the poor lover falls for him, not the family name."),
    ],
    shameType: [
      storyOption("rich_house_etiquette_shame", "Rich-house etiquette shame", "class-coded shame through seating, clothes, gifts, family dinner rules, and quiet contempt at gala or family lunch."),
      storyOption("service_entrance_class_insult", "Service entrance class insult", "the rich family asks the poor lover to use the service entrance during a public visit."),
      storyOption("arranged_match_publicly_paraded", "Arranged match publicly paraded", "an arranged match is paraded in front of the lover at the engagement banquet to break the romance."),
    ],
    revengeMode: [
      storyOption("rich_lover_publicly_chooses_her", "Rich-side lover publicly chooses her", "the rich-side lover stands up to his or her family and publicly chooses the poor lover, no clauses, no boardroom, no contracts."),
      storyOption("she_walks_away_to_protect_him", "She walks away to protect him", "the poor lover walks away first to protect the rich-side lover from his family, forcing him to fight for her."),
      storyOption("hidden_identity_legitimacy_reveal", "Hidden identity legitimacy reveal", "a hidden identity reveal restores public dignity to the underdog lover without humiliating the romance."),
    ],
    endingMode: [
      storyOption("love_after_respect", "Love after respect", "romance can continue only after public respect is paid by the disapproving family."),
      storyOption("dignity_before_money", "Dignity before money", "she refuses to be bought and chooses dignity before wealth."),
      storyOption("public_choice_seals_romance", "Public choice seals romance", "the climactic public choice scene seals the romance and reframes class as a wind, not a wall."),
    ],
  },
  humiliation_revenge_justice: {
    betrayalType: [
      storyOption("they_mocked_wrong_woman", "They mocked the wrong woman", "the crowd mocks her because they misread her status, then the truth makes their cruelty costly."),
      storyOption("public_blame_shift", "Public blame shift", "powerful people push blame onto her in public to protect themselves."),
    ],
    shameType: [
      storyOption("public_humiliation_revenge", "Public humiliation", "public humiliation with witnesses, recorded details, and a social room that turns against her."),
      storyOption("mocked_as_nobody", "Mocked as nobody", "she is called nobody, poor, or useless before anyone learns what she controls."),
    ],
    revengeMode: [
      storyOption("karma_evidence_reveal", "Karma evidence reveal", "evidence flips the room and turns mockery into consequences."),
      storyOption("same_room_status_reversal", "Same-room reversal", "the reversal happens in the exact place where she was humiliated."),
    ],
    endingMode: [
      storyOption("justice_without_cruelty", "Justice without cruelty", "justice lands clearly without making the heroine cruel."),
      storyOption("regret_too_late", "Regret too late", "they regret it only after her dignity is already restored."),
    ],
  },
  secret_identity_hidden_heiress: {
    betrayalType: [
      storyOption("hidden_heiress_dismissed", "Hidden heiress dismissed", "a hidden heiress is treated like staff or a nobody until her real identity becomes unavoidable."),
      storyOption("undercover_ex_assistant", "Undercover assistant", "she goes undercover as an assistant and discovers the truth everyone tried to hide."),
    ],
    shameType: [
      storyOption("mistaken_for_maid", "Mistaken for maid", "she is mistaken for a maid, janitor, assistant, or poor girl by people who rely on her power."),
      storyOption("identity_clues_ignored", "Identity clues ignored", "small identity clues appear but arrogant people ignore them."),
    ],
    revengeMode: [
      storyOption("real_identity_reveal", "Real identity reveal", "the real identity reveal lands after antagonists have committed themselves publicly."),
      storyOption("undercover_truth_package", "Undercover truth package", "undercover evidence exposes betrayal and flips the power room."),
    ],
    endingMode: [
      storyOption("power_without_begging", "Power without begging", "she reveals power without begging to be accepted."),
      storyOption("secret_kept_until_wedding", "Secret until wedding", "the identity stays hidden until a high-stakes ceremony or public event."),
    ],
  },
  toxic_family_betrayal: {
    betrayalType: [
      storyOption("family_kicked_her_out", "Family kicked her out", "toxic family kicks her out or erases her to protect the golden child."),
      storyOption("inheritance_stolen", "Inheritance stolen", "stepmother, sibling, or in-laws steal inheritance, home, or legal rights."),
    ],
    shameType: [
      storyOption("useless_family_label", "Called useless", "family labels her useless while depending on her invisible labor."),
      storyOption("funeral_or_will_humiliation", "Funeral/will humiliation", "humiliation lands during a funeral, will reading, lock change, or family meeting."),
    ],
    revengeMode: [
      storyOption("lawyer_reads_truth", "Lawyer reads the truth", "a will, contract, or lawyer reveals the family stole what was hers."),
      storyOption("built_life_without_family", "Built life without family", "she builds a life they never expected and stops needing family permission."),
    ],
    endingMode: [
      storyOption("family_begs_no_auto_forgiveness", "Family begs, no auto-forgiveness", "family begs to return, but forgiveness is not automatic."),
      storyOption("home_reclaimed", "Home reclaimed", "home, name, and legal dignity are reclaimed."),
    ],
  },
  cheating_ex_wedding_drama: {
    betrayalType: [
      storyOption("wedding_day_betrayal", "Wedding day betrayal", "betrayal erupts at a wedding, engagement, plane ride, or public romantic ritual."),
      storyOption("mistress_took_place", "Mistress took my place", "a mistress, sister, or fake bride tries to take the heroine's place."),
      storyOption("obsessive_possessive_partner", "Obsessive possessive partner", "a dark-romance partner's jealousy, surveillance, or isolation is reframed as love until it is named aloud as coercive control."),
    ],
    shameType: [
      storyOption("backup_bride_shame", "Backup bride shame", "she discovers she was treated as a backup bride in her own love story."),
      storyOption("ex_too_late_public", "Ex too late", "the ex returns publicly only after she is no longer available."),
      storyOption("control_disguised_as_love", "Control disguised as love", "a possessive vow, prenup clause, joint account, or shared phone is used to limit her autonomy in public before she reclaims it."),
    ],
    revengeMode: [
      storyOption("leave_with_assets_truth", "Leave with assets/truth", "she leaves with the truth, assets, or legal leverage they assumed she would not use."),
      storyOption("wedding_truth_reveal", "Wedding truth reveal", "the wedding becomes the place where the truth is revealed."),
      storyOption("name_the_control_and_exit", "Name the control and exit", "she names the coercive control aloud and turns a possessive clause or record into the evidence that frees her."),
    ],
    endingMode: [
      storyOption("marriage_ends_before_landing", "Ends before landing", "she ends the marriage before he can control the story."),
      storyOption("best_man_knows_secret", "Best man knows secret", "an unexpected witness knows the secret and helps expose the lie."),
      storyOption("consent_restored_before_reconciliation", "Consent restored first", "any second-chance or morally-grey romance is earned only after consent, distance, and autonomy are fully restored."),
    ],
  },
  single_mom_poor_woman_comeback: {
    betrayalType: [
      storyOption("single_mom_mocked_at_work", "Single mom mocked at work", "a single mom or poor woman is mocked at work while protecting her child or dignity."),
      storyOption("abandoned_wife_comeback", "Abandoned wife comeback", "an abandoned wife becomes powerful after everyone assumes she is finished."),
    ],
    shameType: [
      storyOption("poor_mother_public_shame", "Poor mother public shame", "public shame targets poverty, motherhood, clothing, or a child's needs."),
      storyOption("child_truth_trigger", "Child reveals truth", "a child carries or reveals the truth adults tried to hide."),
    ],
    revengeMode: [
      storyOption("ceo_walked_in", "CEO walked in", "a CEO, owner, or authority enters after the mockery is visible."),
      storyOption("poor_woman_saved_powerful", "Poor woman saved powerful", "the poor woman saves someone powerful before they know who she is."),
    ],
    endingMode: [
      storyOption("warm_comeback", "Warm comeback", "the comeback restores safety and dignity without cheap cruelty."),
      storyOption("child_protected_future", "Child protected", "the ending secures the child's future and the woman's self-worth."),
    ],
  },
  social_injustice_discrimination_drama: {
    betrayalType: [
      storyOption("refused_service_public", "Refused service", "an innocent or vulnerable person is refused service, accused, or publicly mistreated."),
      storyOption("manager_regretted_it", "Manager regretted it", "a manager or authority abuses power, then learns who they targeted."),
    ],
    shameType: [
      storyOption("restaurant_humiliation", "Restaurant humiliation", "restaurant humiliation or public refusal creates a visible injustice."),
      storyOption("discrimination_without_extremism", "Careful discrimination drama", "discrimination is written carefully, concrete, and not as cheap shock."),
    ],
    revengeMode: [
      storyOption("owner_reveal_justice", "Owner reveal justice", "owner, boss, camera, or policy truth reveals the injustice."),
      storyOption("public_shame_to_justice", "Public shame to justice", "public shame turns into justice through evidence and consequence."),
    ],
    endingMode: [
      storyOption("justice_policy_change", "Justice and policy change", "the ending includes real consequence and safer rules."),
      storyOption("dignity_over_spectacle", "Dignity over spectacle", "the heroine keeps dignity instead of turning justice into cruelty."),
    ],
  },
  workplace_ceo_power_struggle: {
    betrayalType: [
      storyOption("stolen_startup_pitch", "Stolen startup pitch", "a founder, assistant, or intern has her startup pitch stolen before investors and must let the version history mature before the reveal."),
      storyOption("public_layoff_scapegoat", "Public layoff scapegoat", "HR and a toxic boss fire her in public to hide an executive failure."),
      storyOption("assistant_erased_by_ceo", "Assistant erased by CEO", "the CEO depends on her invisible work but lets the board treat her as disposable."),
      storyOption("contract_wife_corporate_leverage", "Contract wife corporate leverage", "a contract marriage / paper marriage clause is used as corporate leverage by a ruthless CEO until she finds the heir clause they did not read."),
      storyOption("ex_wife_divorce_regret", "Ex-wife divorce regret", "ex-husband regrets the divorce only after she returns as a female billionaire / buyer of his company."),
      storyOption("pregnant_secretary_buyout", "Pregnant secretary buyout", "the boss orders a pregnant secretary to sign a silence buyout instead of admitting the secret baby."),
      storyOption("hidden_heiress_in_office", "Hidden heiress in the office", "the hidden heiress signs as his secretary or assistant to audit the family company before the shareholder vote."),
    ],
    shameType: [
      storyOption("all_hands_humiliation", "All-hands humiliation", "office humiliation in an all-hands, HR room, demo day, or Slack thread with witnesses."),
      storyOption("coffee_run_class_shame", "Coffee-run class shame", "coworkers reduce her to errands, clothes, badge color, or contract status before needing her work."),
      storyOption("contract_wife_replaceable_at_gala", "Contract wife called replaceable", "the ruthless billionaire calls his contract wife replaceable at the gala in front of counsel."),
    ],
    revengeMode: [
      storyOption("audit_trail_reversal", "Audit trail reversal", "repo history, pitch deck metadata, cap table, access logs, and board minutes flip the power room."),
      storyOption("boardroom_status_reversal", "Boardroom status reversal", "the board needs the fired woman to save the deal after the public humiliation is documented."),
      storyOption("contract_clause_veto_revenge", "Contract clause veto", "the contract clause she signed becomes her veto, restoring custody, equity, and authorship in the same room."),
      storyOption("female_billionaire_comeback", "Female billionaire comeback", "the ex-wife or revenge queen returns as the buyer of her ex-husband's company or wedding venue."),
    ],
    endingMode: [
      storyOption("career_restitution_first", "Career restitution first", "the ending restores authorship, title, equity, and record before any personal forgiveness."),
      storyOption("new_company_boundary", "New company boundary", "she leaves or rebuilds with clean ownership instead of returning to the old toxic office."),
      storyOption("paper_marriage_rewritten_on_her_terms", "Paper marriage rewritten", "the paper marriage is rewritten as a partnership on her terms, custody and shares secured first."),
    ],
  },
  medical_hidden_doctor_life_care: {
    betrayalType: [
      storyOption("triage_abuse_hidden_doctor", "Triage abuse", "triage staff or a rich family humiliates a hidden doctor, nurse, or poor patient before a chart-backed truth lands."),
      storyOption("nurse_blamed_for_vip_lie", "Nurse blamed for VIP lie", "a nurse or junior doctor is blamed to protect a donor family and must defend patient safety first."),
      storyOption("consent_record_betrayal", "Consent record betrayal", "a family member manipulates consent or billing records to control care and reputation."),
    ],
    shameType: [
      storyOption("patient_dignity_shame", "Patient dignity shame", "a poor, elderly, disabled, or uninsured patient is treated as less worthy of care."),
      storyOption("scrubs_rank_humiliation", "Scrubs rank humiliation", "status shame lands through scrubs, badge hierarchy, insurance desk, visiting privileges, or donor wings."),
    ],
    revengeMode: [
      storyOption("chart_audit_reveal", "Chart audit reveal", "chart audit, consent forms, medication logs, and surgery schedules expose who actually saved the patient."),
      storyOption("ethics_review_justice", "Ethics review justice", "an ethics review or patient-rights hearing forces institutional correction."),
    ],
    endingMode: [
      storyOption("care_before_status", "Care before status", "the heroine protects the patient before accepting public authority."),
      storyOption("patient_rights_restored", "Patient rights restored", "the ending changes the unsafe rule and restores dignity without cheap spectacle."),
    ],
  },
  school_campus_bullying_identity: {
    betrayalType: [
      storyOption("scholarship_student_bullied", "Scholarship student bullied", "a scholarship student is bullied by donor classmates who think poverty means no protection."),
      storyOption("campus_identity_erased", "Campus identity erased", "a hidden heiress, founder's daughter, or talented student is cut from a team photo, stage, or record."),
      storyOption("teacher_protects_bully", "Teacher protects bully", "a teacher, coach, or principal protects the powerful bully until evidence becomes public."),
    ],
    shameType: [
      storyOption("cafeteria_group_chat_shame", "Cafeteria/group-chat shame", "the school turns against her through cafeteria mockery, group chats, uniforms, scholarship labels, or dorm rumors."),
      storyOption("talent_show_public_shame", "Talent show shame", "a public school stage, debate, audition, or talent show becomes the humiliation room."),
    ],
    revengeMode: [
      storyOption("scholarship_exam_reveal", "Scholarship/exam reveal", "scholarship ledgers, exam metadata, CCTV, and donor emails expose the manipulation."),
      storyOption("assembly_status_reversal", "Assembly reversal", "the truth lands at assembly, competition day, parent council, or graduation rehearsal."),
    ],
    endingMode: [
      storyOption("merit_record_restored", "Merit restored", "the ending restores her record and protects the next targeted student."),
      storyOption("identity_without_vanity", "Identity without vanity", "her hidden identity becomes protection and accountability, not a shallow flex."),
    ],
  },
  werewolf_luna_alpha_soulmate: {
    betrayalType: [
      storyOption("alpha_rejected_luna", "Alpha rejected Luna", "Alpha soulmate rejects the Luna bond in public because pack politics, rival pressure, or fear makes him cowardly."),
      storyOption("second_chance_mate_betrayal", "Second-chance mate betrayal", "the werewolf mate bond returns after years of exile, but the heroine demands proof before trusting the Alpha again."),
      storyOption("love_triangle_pack_trial", "Love triangle pack trial", "a rival Luna and a second protector turn the soulmate bond into an enemies-to-lovers love triangle under pack law."),
    ],
    shameType: [
      storyOption("moon_ceremony_rejection", "Moon ceremony rejection", "pack humiliation during a moon ceremony where her victim history is used to say she cannot be Luna."),
      storyOption("rival_luna_status_shame", "Rival Luna status shame", "a rival Luna weaponizes Alpha status, bloodline, and pack rank to make the heroine look unworthy."),
    ],
    revengeMode: [
      storyOption("luna_power_reclaim", "Luna power reclaim", "she proves Luna authority by protecting the pack and exposing the manipulation without begging the Alpha."),
      storyOption("pack_law_bond_reveal", "Pack-law bond reveal", "moon records, scent marks, and witness oaths expose the true soulmate bond and the lie that broke it."),
    ],
    endingMode: [
      storyOption("respect_before_bond", "Respect before bond", "the bond can matter only after the Alpha pays respect publicly and the heroine chooses freely."),
      storyOption("luna_chooses_herself", "Luna chooses herself", "she keeps her wolf, name, and authority even if romance remains conditional."),
    ],
  },
  steamy_alien_captive_romance: {
    betrayalType: [
      storyOption("alien_captive_claimed", "Alien captive claimed", "adult alien captive drama where a dominant ruler mistakes possession for loyalty until the heroine breaks the script."),
      storyOption("arrogant_commander_contract", "Arrogant commander contract", "an arrogant alien commander uses empire law to control her, then discovers she understands the contract better than he does."),
      storyOption("opposites_attract_dark_court", "Opposites-attract dark court", "a human female lead and possessive alien lord clash in a dark court where desire must answer to consent."),
    ],
    shameType: [
      storyOption("collar_court_spectacle", "Collar court spectacle", "sensual power shame through a collar, translator mark, court display, or command-deck ritual treated as political theater."),
      storyOption("property_label_refused", "Property label refused", "alien law labels her property, but every scene shows her resisting that identity and preserving agency."),
    ],
    revengeMode: [
      storyOption("consent_contract_reversal", "Consent contract reversal", "she uses alien contracts, ship logs, and collar code to prove coercion and force legal freedom."),
      storyOption("empire_needs_captive", "Empire needs captive", "the empire needs the captive heroine's skill, translation, immunity, or strategy, but she negotiates as a free adult."),
    ],
    endingMode: [
      storyOption("consent_before_romance", "Consent before romance", "romance is possible only after consent, legal freedom, and agency are restored."),
      storyOption("possessive_to_respect", "Possessive to respect", "the possessive ruler must replace ownership with respect before he can stay in the heroine's orbit."),
    ],
  },
} satisfies StoryControlsByNiche;

export function getLocalStoryControls(): StoryControlsByNiche {
  return JSON.parse(JSON.stringify(NICHE_STORY_CONTROLS)) as StoryControlsByNiche;
}

function storyOption(value: string, label: string, prompt: string): StoryControlOption {
  return { value, label, prompt };
}
