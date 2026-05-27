(function () {
  const RANDOM_STORY_CONTROL_VALUE = "__random__";
  const CUSTOM_OPTION_VALUE = "__custom__";
  const CUSTOM_OPTION_LABEL = "T\u1ef1 nh\u1eadp tay";
  const DEFAULT_LINE_PRESET = "billionaire_rich_poor_romance";
  const DEFAULT_STYLE_LENS = "tiktok_hook_pacing";
  const DEFAULT_AUTOMATION_STORY_COUNT = 10;
  const MIN_AUTOMATION_STORY_COUNT = 1;
  const MAX_AUTOMATION_STORY_COUNT = 50;
  const SESSION_SAVE_DEBOUNCE_MS = 600;
  const RANDOM_SETTING_SEED_VALUE = "__random_setting_seed__";
  const LEGACY_LINE_PRESET_MIGRATIONS = {
    betrayal_romance_revenge_class_shame: "billionaire_rich_poor_romance",
    betrayal_revenge_drama: "humiliation_revenge_justice",
    social_class_power_drama: "social_injustice_discrimination_drama",
    coming_of_age_identity_drama: "secret_identity_hidden_heiress",
    toxic_romance_emotional_damage: "cheating_ex_wedding_drama",
    quiet_literary_relationship_realism: "toxic_family_betrayal",
    psychological_thriller_drama: "secret_identity_hidden_heiress",
    romantasy_drama: "secret_identity_hidden_heiress",
  };
  const SETTING_SEED_CUSTOM_PLACEHOLDER = "Startup xa xỉ và các vòng tròn gia đình thượng lưu";
  const SETTING_SEED_RANDOM_PLACEHOLDER = "App sẽ tự sinh bối cảnh theo xu hướng truyện drama hiện nay.";
  const SETTING_SEED_RANDOM_PROMPT =
    "Tự sinh bối cảnh theo xu hướng truyện drama hiện nay: ưu tiên môi trường giàu xung đột, giai tầng, quyền lực, mạng xã hội, công sở/giải trí/đời sống đô thị, dễ tạo phản bội và nhục mạ công khai.";

  const OUTPUT_LANGUAGE_LABELS = {
    english: "Tiếng Anh",
    vietnamese: "Tiếng Việt",
    japanese: "Tiếng Nhật",
    korean: "Tiếng Hàn",
    portuguese: "Tiếng Bồ Đào Nha",
    spanish: "Tiếng Tây Ban Nha",
  };

  const SELECT_OPTION_LABELS = {
    "line-preset": {
      billionaire_rich_poor_romance: "Niche 1: T\u1ef7 ph\u00fa / Gi\u00e0u ngh\u00e8o / T\u00ecnh y\u00eau v\u01b0\u1ee3t giai c\u1ea5p",
      humiliation_revenge_justice: "Niche 2: B\u1ecb s\u1ec9 nh\u1ee5c / Tr\u1ea3 \u0111\u0169a / C\u00f4ng l\u00fd",
      secret_identity_hidden_heiress: "Niche 3: Th\u00e2n ph\u1eadn b\u00ed m\u1eadt / Thi\u00ean kim \u1ea9n danh / N\u1eb1m v\u00f9ng",
      toxic_family_betrayal: "Niche 4: Gia \u0111\u00ecnh \u0111\u1ed9c h\u1ea1i / Ph\u1ea3n b\u1ed9i gia \u0111\u00ecnh",
      cheating_ex_wedding_drama: "Niche 5: Ngo\u1ea1i t\u00ecnh / Ng\u01b0\u1eddi y\u00eau c\u0169 / Drama c\u01b0\u1edbi",
      single_mom_poor_woman_comeback: "Niche 6: M\u1eb9 \u0111\u01a1n th\u00e2n / Ph\u1ee5 n\u1eef ngh\u00e8o l\u1eadt k\u00e8o",
      social_injustice_discrimination_drama: "Niche 7: B\u1ea5t c\u00f4ng x\u00e3 h\u1ed9i / Ph\u00e2n bi\u1ec7t \u0111\u1ed1i x\u1eed",
      workplace_ceo_power_struggle: "Niche 8: C\u00f4ng s\u1edf / CEO / Tranh quy\u1ec1n ngh\u1ec1 nghi\u1ec7p",
      medical_hidden_doctor_life_care: "Niche 9: Y t\u1ebf / B\u00e1c s\u0129 \u1ea9n danh / Sinh t\u1eed v\u00e0 ch\u0103m s\u00f3c",
      school_campus_bullying_identity: "Niche 10: H\u1ecdc \u0111\u01b0\u1eddng / Campus / B\u1eaft n\u1ea1t v\u00e0 th\u00e2n ph\u1eadn",
      werewolf_luna_alpha_soulmate: "Niche 11: Werewolf / Luna / Alpha bond drama",
      steamy_alien_captive_romance: "Niche 12: Steamy / Alien masters / Dark captive romance",
    },
  };

  let nicheStoryControls = {};

  const STYLE_LENSES = [
    { value: "clean_short_quote_pain", label: "Câu đau ngắn, dễ quote" },
    { value: "polite_social_knife", label: "Dao xã hội lịch sự" },
    { value: "high_dialogue_confrontation", label: "Đối thoại căng, đối đầu trực diện" },
    { value: "quiet_interior_realism", label: "Hiện thực nội tâm lặng" },
    { value: "glamour_decay", label: "Hào nhoáng mục ruỗng" },
    { value: "gothic_romantic_pressure", label: "Áp lực romance u tối" },
    { value: "cold_paranoia", label: "Hoang tưởng lạnh" },
    { value: "tiktok_hook_pacing", label: "Hook nhanh kiểu short-form" },
    { value: "slow_burn_suppressed_confession", label: "Slow-burn, lời thú nhận bị nén" },
    { value: "cinematic_scene_turns", label: "Cảnh phim rõ nhịp xoay" },
  ];

  const BRANCH_STYLE_LENS_ORDER = {
    toxic_romance_emotional_damage: [
      "clean_short_quote_pain",
      "tiktok_hook_pacing",
      "slow_burn_suppressed_confession",
      "high_dialogue_confrontation",
      "gothic_romantic_pressure",
      "cinematic_scene_turns",
      "polite_social_knife",
      "quiet_interior_realism",
      "glamour_decay",
      "cold_paranoia",
    ],
    betrayal_revenge_drama: [
      "high_dialogue_confrontation",
      "cinematic_scene_turns",
      "polite_social_knife",
      "tiktok_hook_pacing",
      "quiet_interior_realism",
      "clean_short_quote_pain",
      "glamour_decay",
      "cold_paranoia",
      "slow_burn_suppressed_confession",
      "gothic_romantic_pressure",
    ],
    psychological_thriller_drama: [
      "cold_paranoia",
      "cinematic_scene_turns",
      "quiet_interior_realism",
      "slow_burn_suppressed_confession",
      "polite_social_knife",
      "clean_short_quote_pain",
      "high_dialogue_confrontation",
      "glamour_decay",
      "gothic_romantic_pressure",
      "tiktok_hook_pacing",
    ],
    romantasy_drama: [
      "gothic_romantic_pressure",
      "cinematic_scene_turns",
      "glamour_decay",
      "high_dialogue_confrontation",
      "slow_burn_suppressed_confession",
      "clean_short_quote_pain",
      "polite_social_knife",
      "quiet_interior_realism",
      "cold_paranoia",
      "tiktok_hook_pacing",
    ],
    quiet_literary_relationship_realism: [
      "quiet_interior_realism",
      "slow_burn_suppressed_confession",
      "polite_social_knife",
      "clean_short_quote_pain",
      "cinematic_scene_turns",
      "glamour_decay",
      "cold_paranoia",
      "high_dialogue_confrontation",
      "gothic_romantic_pressure",
      "tiktok_hook_pacing",
    ],
    coming_of_age_identity_drama: [
      "clean_short_quote_pain",
      "quiet_interior_realism",
      "tiktok_hook_pacing",
      "slow_burn_suppressed_confession",
      "cinematic_scene_turns",
      "high_dialogue_confrontation",
      "polite_social_knife",
      "glamour_decay",
      "cold_paranoia",
      "gothic_romantic_pressure",
    ],
    social_class_power_drama: [
      "polite_social_knife",
      "glamour_decay",
      "quiet_interior_realism",
      "cinematic_scene_turns",
      "clean_short_quote_pain",
      "high_dialogue_confrontation",
      "slow_burn_suppressed_confession",
      "cold_paranoia",
      "tiktok_hook_pacing",
      "gothic_romantic_pressure",
    ],
    betrayal_romance_revenge_class_shame: [
      "polite_social_knife",
      "clean_short_quote_pain",
      "slow_burn_suppressed_confession",
      "glamour_decay",
      "high_dialogue_confrontation",
      "cinematic_scene_turns",
      "quiet_interior_realism",
      "tiktok_hook_pacing",
      "cold_paranoia",
      "gothic_romantic_pressure",
    ],
  };

  const LEGACY_STYLE_LENS_BY_PRESET = {
    austen_social_knife: "polite_social_knife",
    bronte_gothic_romance_wound: "gothic_romantic_pressure",
    du_maurier_psychological_shadow: "cold_paranoia",
    fitzgerald_glittering_decay: "glamour_decay",
    highsmith_cold_paranoia: "cold_paranoia",
    wharton_class_shame_elegance: "polite_social_knife",
  };

  const UNIVERSAL_STORY_CONTROLS = {
    betrayalType: [
      storyOption("built_him_lost_him", "Cùng hắn đi lên rồi bị bỏ lại", "phản bội bằng cách dùng năm tháng hy sinh của nữ chính làm bệ phóng, rồi loại cô khỏi tương lai khi hắn có vị thế."),
      storyOption("hidden_girl_public_replacement", "Yêu trong bóng tối, thay thế ngoài sáng", "phản bội bằng cách yêu nữ chính riêng tư nhưng công khai chọn người phụ nữ đúng chuẩn hơn."),
      storyOption("credit_theft_by_partner", "Cướp công lao/chất xám", "phản bội bằng cách nhận công trước đám đông từ chính thứ nữ chính tạo ra."),
      storyOption("best_friend_stole_lover", "Bạn thân cướp người yêu", "phản bội kép: người hiểu vết thương của nữ chính dùng nó để cướp tình yêu."),
      storyOption("family_chose_golden_child", "Gia đình chọn đứa con vàng", "phản bội gia đình khi nữ chính bị hi sinh để bảo vệ người được ưu ái."),
      storyOption("replacement_for_old_love", "Chỉ là bản thay thế", "nữ chính phát hiện mình không phải duy nhất mà là phiên bản thay cho người hắn thật sự muốn."),
      storyOption("public_denial_after_private_dependence", "Phụ thuộc riêng tư, phủ nhận công khai", "hắn cần nữ chính khi yếu đuối nhưng phủ nhận cô trước người có quyền."),
      storyOption("contract_useful_woman_discarded", "Người phụ nữ hữu ích bị bỏ", "cô chỉ được giữ lại khi còn hữu dụng, không phải vì được chọn."),
      storyOption("wrong_woman_for_family", "Không đủ chuẩn nhà hắn", "hắn để gia đình khiến cô hiểu cô không đủ tư cách bước qua cửa."),
      storyOption("scandal_shifted_to_heroine", "Bị đẩy thành kẻ gây scandal", "người có quyền đẩy lỗi lên nữ chính để giữ danh tiếng sạch cho họ."),
    ],
    shameType: [
      storyOption("polite_class_exclusion", "Loại trừ lịch sự", "nhục mạ bằng phép lịch sự: chỗ ngồi, lời giới thiệu, ánh mắt và nghi thức đều đặt nữ chính thấp hơn."),
      storyOption("introduced_as_acquaintance", "Bị giới thiệu là người quen", "nhục mạ tình yêu khi người đáng lẽ công khai cô chỉ gọi cô là người quen hoặc nhân viên hỗ trợ."),
      storyOption("seat_card_staff_table", "Bị xếp vào bàn thấp hơn", "nhục mạ công khai qua vị trí ngồi, khu phụ, bàn nhân viên hoặc cửa sau."),
      storyOption("dress_code_humiliation", "Bị chê cách ăn mặc/nền tảng", "nhục mạ bằng dress code, giọng nói, học vấn, gia cảnh hoặc chi tiết tiền bạc nhỏ."),
      storyOption("pity_not_respect", "Bị thương hại thay vì tôn trọng", "người trên tiếp đón cô bằng lòng thương hại lịch sự thay vì công nhận giá trị."),
      storyOption("competence_erased", "Bị xóa năng lực", "công sức thật bị gọi thành hỗ trợ nhỏ hoặc may mắn."),
      storyOption("invisible_labor", "Lao động vô hình", "cô chăm sóc, vận hành, sửa lỗi và cứu người khác nhưng không ai nhớ tên."),
      storyOption("comparison_with_proper_woman", "Bị so với người phụ nữ đúng chuẩn", "tình địch chỉ cần đúng chuẩn hơn để biến nữ chính thành lựa chọn sai."),
      storyOption("media_scandal_scape_goat", "Bị truyền thông/công ty đổ lỗi", "cô bị biến thành người không biết thân phận để bảo vệ người có quyền."),
      storyOption("family_gatekeeping", "Bị gia đình gác cổng", "gia đình dùng bữa ăn, họ hàng, quy tắc và di sản để dạy cô biết vị trí."),
    ],
    revengeMode: [
      storyOption("silent_comeback_status_reversal", "Silent comeback đảo vị thế", "trả đũa bằng cách biến mất, dựng lại giá trị, rồi trở lại ở vị thế khiến họ phải xin quyền tiếp cận."),
      storyOption("withdraw_emotional_labor", "Rút lao động cảm xúc", "trả đũa bằng cách ngừng cứu, ngừng dỗ, ngừng làm nơi an toàn cho kẻ đã dùng cô."),
      storyOption("withdraw_operational_system", "Rút khỏi hệ thống vận hành", "trả đũa bằng cách rút khỏi phần vận hành mà họ tưởng tự nhiên tồn tại."),
      storyOption("evidence_based_narrative_flip", "Lật narrative bằng bằng chứng", "không bóc phốt cảm tính; dùng bản nháp, log, hợp đồng, thời điểm để lật câu chuyện."),
      storyOption("refuse_late_rescue", "Từ chối cứu hắn quá muộn", "khi hắn cần cứu danh tiếng/thương vụ/gia đình, cô đặt điều kiện hoặc từ chối vai hi sinh cũ."),
      storyOption("public_credit_reclaim", "Đòi lại công lao trước công chúng", "lấy lại quyền tác giả/năng lực bằng màn công khai sạch khiến kẻ cướp công không phản bác được."),
      storyOption("new_alliance_power_room", "Liên minh với phòng quyền lực mới", "bước vào liên minh hoặc thế lực mà hắn từng muốn được chọn."),
      storyOption("make_him_wait_outside", "Bắt hắn đứng ngoài cánh cửa cũ", "đảo nghi thức: người từng để cô chờ ngoài cửa giờ phải chờ cô cho vào."),
      storyOption("legal_contractual_turn", "Lật bằng hợp đồng/quyền pháp lý", "dùng điều khoản, quyền sở hữu hoặc chứng cứ hợp pháp để giành lại thứ bị lấy."),
      storyOption("dignified_exit_no_speech", "Rời đi sạch, không diễn thuyết", "trả đũa bằng sự vắng mặt đúng lúc, để khoảng trống buộc họ hiểu giá trị đã mất."),
    ],
    endingMode: [
      storyOption("dignity_first_no_reunion", "Phẩm giá trước tình yêu", "kết thúc ưu tiên phẩm giá: nữ chính không tái hợp chỉ vì hắn hối hận muộn."),
      storyOption("bittersweet_clean_break", "Chia tay sạch, dư vị đắng", "còn tình cảm hoặc ký ức nhưng rời đi là lựa chọn trưởng thành nhất."),
      storyOption("he_needs_her_too_late", "Hắn cần cô quá muộn", "hắn nhận ra giá trị của cô khi cô không còn đói tình yêu đến mức tự hạ mình."),
      storyOption("public_truth_private_grief", "Sự thật công khai, nỗi buồn riêng", "sự thật được trả lại trước đám đông nhưng nỗi đau thật xử lý trong im lặng."),
      storyOption("status_reversal_final_gala", "Gala cuối đảo vị thế", "màn cuối ở sự kiện xã hội nơi không phòng nào còn đặt cô thấp được."),
      storyOption("revenge_without_cruelty", "Thắng mà không tàn nhẫn", "cô thắng nhưng không trở thành phiên bản tàn nhẫn của người làm cô đau."),
      storyOption("new_love_optional", "Tình yêu mới chỉ là khả năng", "nếu có tình yêu mới, nó là khả năng mở; trọng tâm vẫn là cô tự xác nhận giá trị."),
      storyOption("family_bows_not_forgiven", "Gia đình cúi đầu nhưng không mua được tha thứ", "người từng khinh cô phải công nhận cô nhưng không tự động được tha thứ."),
      storyOption("career_power_solidifies", "Quyền lực mới được củng cố", "cô không chỉ thắng một người mà thoát khỏi cấu trúc cũ."),
      storyOption("quiet_self_naming", "Tự gọi tên mình", "kết lặng: nữ chính tự gọi đúng giá trị mình, không chờ ai đặt tên hay chọn cô."),
    ],
  };

  const DRAMA_BRANCH_PRESETS = {
    toxic_romance_emotional_damage: {
      betrayalType: [
        storyOption("wedding_planner_ex_wedding", "Làm wedding planner cho cưới người yêu cũ", "phản bội kiểu toxic romance: cô chuẩn bị đám cưới cho người từng hứa cưới mình."),
        storyOption("intermittent_kindness_trap", "Tử tế ngắt quãng để giữ chân", "người kia lúc dịu dàng lúc lạnh nhạt, khiến nữ chính nghiện phần thưởng cảm xúc."),
        storyOption("he_likes_being_loved", "Hắn nghiện cảm giác được yêu", "twist: hắn không yêu cô nữa, chỉ nghiện cảm giác cô vẫn yêu hắn."),
      ],
      shameType: [
        storyOption("private_tender_public_cold", "Dịu dàng riêng tư, lạnh công khai", "nhục mạ bằng tương phản: ở riêng hắn dịu, ra ngoài hắn để cô thành người dư."),
        storyOption("almost_chosen_then_dropped", "Suýt được chọn rồi bị buông", "hắn tạo hi vọng công khai rồi buông tay đúng lúc cô yếu lòng."),
        storyOption("emotional_crumbs", "Tình yêu vụn thừa", "cô chỉ nhận được chút quan tâm thừa, không bao giờ là ưu tiên."),
      ],
      revengeMode: [
        storyOption("break_attachment_loop", "Cắt vòng nghiện cảm xúc", "trả đũa bằng cách ngừng phản ứng với tử tế ngắt quãng của hắn."),
        storyOption("refuse_old_comfort_role", "Không làm nơi trú ẩn cũ", "cô không còn là người hắn tìm đến khi cô đơn rồi bỏ quên khi sáng đèn."),
        storyOption("name_the_addiction", "Gọi tên cơn nghiện được yêu", "cô buộc hắn đối diện việc hắn chỉ nghiện cảm giác được cô yêu."),
      ],
      endingMode: [
        storyOption("detox_no_reunion", "Detox tình yêu, không quay lại", "kết thúc là cai nghiện cảm xúc, không phải phần thưởng tái hợp."),
        storyOption("love_without_self_betrayal", "Còn yêu nhưng không phản bội chính mình", "cô thừa nhận còn đau nhưng không dùng tình yêu để tự hạ mình nữa."),
        storyOption("too_late_after_detachment", "Hắn quay lại sau khi cô đã tỉnh", "hắn trở về đúng lúc cô không còn cần được chọn."),
      ],
    },
    betrayal_revenge_drama: {
      betrayalType: [
        storyOption("ghostwriter_credit_theft", "Ghostwriter bị cướp sách", "phản bội bằng cách lấy tác phẩm của nữ chính để đứng trên sân khấu nhận công."),
        storyOption("best_friend_life_theft", "Bạn thân cướp luôn cuộc đời", "người hiểu cô nhất cướp tình yêu, công việc và câu chuyện của cô."),
        storyOption("golden_child_family_betrayal", "Gia đình hi sinh cô cho đứa con vàng", "gia đình bắt cô nuốt nhục để bảo vệ người được ưu ái."),
      ],
      shameType: [
        storyOption("public_applause_erasure", "Bị xóa tên giữa tiếng vỗ tay", "nhục mạ khi người khác nhận công của cô trước công chúng."),
        storyOption("forced_silence_for_family", "Bị ép im lặng vì gia đình", "cô bị yêu cầu im lặng để giữ mặt mũi cho người phản bội."),
        storyOption("weak_jealous_narrative", "Bị dựng thành kẻ ghen yếu đuối", "narrative của kẻ phản bội biến cô thành người nhỏ nhen, thất bại."),
      ],
      revengeMode: [
        storyOption("delayed_receipt_drop", "Thả bằng chứng đúng thời điểm", "trả đũa bằng bằng chứng để lâu đến lúc cái giá xã hội cao nhất."),
        storyOption("competence_proves_truth", "Năng lực chứng minh sự thật", "cô không tranh cãi; cô tạo sản phẩm mới khiến sự thật tự lộ."),
        storyOption("turn_the_stage_back", "Lấy lại sân khấu", "nơi từng tôn vinh kẻ cướp công trở thành nơi trả lại tên cô."),
      ],
      endingMode: [
        storyOption("justice_without_noise", "Công lý không ồn", "kết bằng công lý sạch, ít lời, không biến thành màn la hét."),
        storyOption("truth_rewrites_status", "Sự thật viết lại địa vị", "khi sự thật lộ ra, không chỉ tình cảm mà cả địa vị xã hội đổi chiều."),
        storyOption("betrayer_publicly_small", "Kẻ phản bội nhỏ lại trước công chúng", "người từng đứng trên sân khấu phải nhỏ lại trong chính ánh đèn đó."),
      ],
    },
    psychological_thriller_drama: {
      betrayalType: [
        storyOption("wrong_memory_gaslight", "Ký ức sai bị lợi dụng", "phản bội tâm lý: người thân dùng ký ức lệch của nữ chính để kiểm soát cô."),
        storyOption("perfect_partner_rotten_secret", "Người hoàn hảo giấu bí mật mục ruỗng", "người yêu/chồng hoàn hảo dựng vỏ bọc đẹp để che một sự thật thối rữa."),
        storyOption("neighbor_knows_too_much", "Người nhắn tin biết quá nhiều", "một người gần nhà biết những chi tiết không ai nên biết."),
      ],
      shameType: [
        storyOption("called_unstable", "Bị gọi là bất ổn", "nhục mạ bằng gaslight: mọi dấu hiệu đúng bị biến thành cô quá nhạy cảm."),
        storyOption("evidence_disappears", "Bằng chứng biến mất", "cô bị làm nhục vì không chứng minh được điều mình vừa thấy."),
        storyOption("polite_neighborhood_doubt", "Khu phố lịch sự nghi ngờ cô", "cộng đồng văn minh dùng lịch sự để cô lập người nói thật."),
      ],
      revengeMode: [
        storyOption("pattern_board_reveal", "Lập bảng pattern để lật mặt", "trả đũa bằng cách nối các chi tiết tưởng rời rạc thành pattern không thể chối."),
        storyOption("trap_with_false_memory", "Gài bẫy bằng ký ức giả", "cô cố ý đưa một ký ức sai để xem ai phản ứng như đã biết."),
        storyOption("make_safe_room_testify", "Biến nơi an toàn thành nhân chứng", "căn hộ, camera, đồ vật hoặc âm thanh trở thành bằng chứng."),
      ],
      endingMode: [
        storyOption("truth_one_answer_two_scars", "Sự thật trả lời một câu, để lại hai vết sẹo", "kết giải thích được lời nói dối chính nhưng giữ dư chấn tâm lý."),
        storyOption("danger_was_home", "Nguy hiểm luôn ở trong nhà", "twist cuối xác nhận mối đe dọa gần hơn cô tưởng."),
        storyOption("calm_after_paranoia", "Bình tĩnh sau vòng hoang tưởng", "kết bằng sự tỉnh táo lạnh, không cần catharsis ồn."),
      ],
    },
    romantasy_drama: {
      betrayalType: [
        storyOption("prince_betrays_for_throne", "Thái tử phản bội vì ngai", "phản bội khi tình yêu bị hi sinh cho ngai vàng hoặc sinh tồn triều đình."),
        storyOption("immortal_court_uses_human_girl", "Triều đình bất tử dùng cô gái người thường", "cô bị xem như công cụ chính trị trong tòa án bất tử."),
        storyOption("future_self_burial_secret", "Bí mật chôn các phiên bản tương lai", "người yêu biết cô từng chết ở tương lai khác nhưng giấu để bảo vệ quyền lực."),
      ],
      shameType: [
        storyOption("mortal_blood_shame", "Bị khinh vì máu phàm", "nhục mạ bằng huyết thống, tuổi thọ, phép thuật hoặc xuất thân thấp."),
        storyOption("court_etiquette_trap", "Bị bẫy bằng nghi lễ triều đình", "nghi thức cao cấp biến cô thành kẻ quê mùa trước cả triều."),
        storyOption("chosen_but_unwanted", "Được chọn nhưng không được muốn", "cô có giá trị định mệnh nhưng bị khinh như món đồ cần thiết."),
      ],
      revengeMode: [
        storyOption("use_curse_rules_as_leverage", "Dùng luật nguyền làm đòn bẩy", "trả đũa bằng cách hiểu luật nguyền sâu hơn những kẻ cai trị."),
        storyOption("deny_throne_sacrifice", "Từ chối làm vật hi sinh cho ngai", "cô phá mô hình tình yêu phải chết để ngai sống."),
        storyOption("future_knowledge_reversal", "Đảo thế bằng ký ức tương lai", "kiến thức từ các phiên bản chết giúp cô đi trước triều đình."),
      ],
      endingMode: [
        storyOption("love_vs_throne_choice", "Tình yêu đối đầu ngai vàng", "kết buộc lựa chọn giữa tình yêu và quyền lực thật sự có giá."),
        storyOption("queen_of_cursed_land", "Trở thành chủ vùng đất nguyền", "cô không chỉ sống sót mà sở hữu nơi từng chôn mình."),
        storyOption("immortal_regret_mortal_freedom", "Kẻ bất tử hối hận, người phàm tự do", "người quyền lực sống lâu với hối tiếc còn cô chọn tự do hữu hạn."),
      ],
    },
    quiet_literary_relationship_realism: {
      betrayalType: [
        storyOption("poverty_fatigue_breakup", "Chia tay vì mệt với nghèo", "phản bội không ngoại tình: một người mệt với nghèo, người kia mệt vì không đủ."),
        storyOption("emotional_cowardice_leave", "Rời đi vì hèn cảm xúc", "người yêu không phản bội bằng hành động lớn mà bằng né tránh lặp lại."),
        storyOption("silence_in_marriage", "Im lặng trong hôn nhân", "hôn nhân chết dần vì những câu đáng lẽ phải nói nhưng không ai nói."),
      ],
      shameType: [
        storyOption("rent_price_silence", "Im lặng trước tiền thuê nhà", "nhục mạ rất đời: giá tiền khiến tình yêu cảm thấy bất lực."),
        storyOption("micro_humiliation_daily", "Tổn thương nhỏ lặp lại", "những câu nói nhỏ và ánh mắt nhỏ tích thành vết đau lớn."),
        storyOption("not_enough_feeling", "Cảm giác mình không đủ", "nữ chính bị bào mòn bởi cảm giác mình luôn thiếu một điều gì đó."),
      ],
      revengeMode: [
        storyOption("choose_absence_quietly", "Chọn vắng mặt lặng lẽ", "trả đũa không phải trừng phạt mà là ngừng có mặt để tự cứu mình."),
        storyOption("say_one_true_sentence", "Nói đúng một câu thật", "một câu nói ra điều bị nén quá lâu, đủ làm quan hệ đổi chiều."),
        storyOption("stop_translating_his_silence", "Ngừng phiên dịch sự im lặng của hắn", "cô ngừng tự bào chữa cho người không chịu nói thật."),
      ],
      endingMode: [
        storyOption("recognition_without_return", "Nhận ra nhau nhưng không quay lại", "kết bằng sự hiểu muộn, không phải đoàn tụ."),
        storyOption("ordinary_life_after_love", "Đời thường sau tình yêu", "cô bước vào một ngày bình thường hơn nhưng thật hơn."),
        storyOption("small_clean_mercy", "Một lòng trắc ẩn sạch", "hai người không thắng nhau; họ chỉ thôi làm nhau đau."),
      ],
    },
    coming_of_age_identity_drama: {
      betrayalType: [
        storyOption("family_brand_good_girl", "Gia đình biến cô thành thương hiệu con ngoan", "phản bội bản sắc khi gia đình dùng hình ảnh của cô như tài sản."),
        storyOption("anonymous_knows_old_self", "Người lạ biết con người cũ", "một lá thư gọi cô là đồ giả và biết phiên bản trước khi cô thành thương hiệu."),
        storyOption("strict_parent_public_pride_private_control", "Tự hào công khai, kiểm soát riêng tư", "cha mẹ khoe cô với thế giới nhưng kiểm soát con người thật của cô."),
      ],
      shameType: [
        storyOption("called_fake_identity", "Bị gọi là đồ giả", "nhục mạ bản sắc: cô bị phơi ra là người đang diễn vai gia đình muốn."),
        storyOption("poor_kid_rich_school", "Đứa nghèo giữa trường giàu", "class shame tuổi trẻ qua đồ dùng, học phí, câu lạc bộ và nhóm bạn."),
        storyOption("burnout_good_student", "Học sinh giỏi sụp đổ", "nhục mạ khi thành tích không còn che được kiệt sức."),
      ],
      revengeMode: [
        storyOption("break_family_brand", "Phá thương hiệu gia đình", "trả đũa bằng cách ngừng biểu diễn hình ảnh con ngoan được đóng gói."),
        storyOption("publish_real_self", "Công khai con người thật", "cô tự kể câu chuyện thật thay vì để gia đình hoặc mạng xã hội kể hộ."),
        storyOption("choose_belonging_elsewhere", "Chọn nơi thuộc về khác", "cô rời hệ đo giá trị cũ và tìm cộng đồng nhìn thấy cô thật."),
      ],
      endingMode: [
        storyOption("delayed_selfhood", "Muộn nhưng là chính mình", "kết bằng việc cô bắt đầu sống như bản thân, dù muộn hơn mong đợi."),
        storyOption("not_family_trophy", "Không còn là cúp của gia đình", "gia đình mất quyền trưng bày cô như thành tích."),
        storyOption("soft_identity_arrival", "Bản sắc đến nhẹ nhưng chắc", "không cần tuyên ngôn lớn; cô chỉ thôi nói dối về mình."),
      ],
    },
    social_class_power_drama: {
      betrayalType: [
        storyOption("nanny_invisible_love", "Bảo mẫu yêu đứa trẻ hơn cả nhà chủ", "phản bội quyền lực khi người chăm sóc thật bị xem như đồ dùng thay được."),
        storyOption("scholarship_student_humiliated", "Học sinh học bổng bị làm nhục", "người nghèo được cho cơ hội nhưng bị nhắc liên tục rằng mình nợ nơi đó."),
        storyOption("wife_in_wealthy_family_erased", "Người vợ trong nhà giàu bị xóa tên", "vợ hoặc dâu bị giữ trong nhà như chức năng, không như con người."),
      ],
      shameType: [
        storyOption("name_forgotten_in_rich_house", "Không ai nhớ tên trong nhà giàu", "nhục mạ bằng sự vô hình: cô ru con họ ngủ nhưng họ không nhớ tên cô."),
        storyOption("charity_as_control", "Lòng tốt dùng để kiểm soát", "hỗ trợ tài chính biến thành dây xích đạo đức."),
        storyOption("luxury_rule_exclusion", "Luật xa xỉ để loại trừ", "tiền, đồ hiệu, cách ăn và không gian dùng để nhắc cô thấp hơn."),
      ],
      revengeMode: [
        storyOption("withdraw_care_labor", "Rút lao động chăm sóc", "trả đũa bằng cách rút thứ tình cảm và chăm sóc mà tiền không mua thật được."),
        storyOption("make_elites_face_dependence", "Bắt giới giàu đối diện phụ thuộc", "cô khiến họ hiểu hệ thống đẹp đẽ sống nhờ lao động vô hình."),
        storyOption("own_the_service_story", "Sở hữu câu chuyện người phục vụ", "cô biến trải nghiệm bị xem thường thành quyền nói và lợi thế."),
      ],
      endingMode: [
        storyOption("dignity_over_aspiration", "Phẩm giá hơn giấc mơ leo tầng", "kết không phải được nhà giàu nhận, mà là không cần họ xác nhận."),
        storyOption("child_remembers_name", "Đứa trẻ nhớ tên cô", "một chi tiết nhỏ trả lại nhân tính mà người lớn giàu có đánh mất."),
        storyOption("worker_becomes_gatekeeper", "Người vô hình thành người giữ cửa", "đảo vị thế: người từng không được nhớ tên nay quyết định ai được vào."),
      ],
    },
    betrayal_romance_revenge_class_shame: {
      betrayalType: [
        storyOption("hidden_girl_public_replacement", "The hidden girl", "phản bội bằng cách yêu cô trong bí mật nhưng không bao giờ chọn cô ngoài sáng."),
        storyOption("built_him_lost_him", "Built him, lost him", "cô đi cùng hắn từ tay trắng; khi hắn có tất cả, hắn bỏ cô lại."),
        storyOption("useful_secretary_not_chosen", "Thư ký bí mật không được chọn", "cô vận hành đời hắn nhưng ngoài sáng hắn chọn hôn thê môn đăng hộ đối."),
      ],
      shameType: [
        storyOption("wrong_woman_for_family", "Wrong woman for the family", "nhục mạ giai tầng khi nhà hắn tiếp đón cô bằng lịch sự dành cho người không đủ tư cách."),
        storyOption("contract_wife_real_shame", "Hôn nhân giả, nhục thật", "hợp đồng tưởng lạnh nhưng làm đau thật khi cô bắt đầu có tình cảm."),
        storyOption("proper_woman_comparison", "Bị so với người phụ nữ đúng chuẩn", "tình địch lịch sự hơn, đúng tầng lớp hơn, khiến cô thấp đi mà không cần chửi."),
      ],
      revengeMode: [
        storyOption("withdraw_what_he_took_for_granted", "Rút thứ hắn tưởng hiển nhiên", "trả đũa bằng cách rút năng lực, chăm sóc và hệ thống hắn sống dựa vào."),
        storyOption("not_save_his_status_for_free", "Không cứu danh tiếng miễn phí", "khi chỉ cô cứu được thương vụ/danh tiếng, cô không còn cứu miễn phí."),
        storyOption("deny_cheap_reconciliation", "Từ chối hòa giải rẻ", "hắn xin quay lại muộn nhưng cô không bán phẩm giá lấy một lời xin lỗi."),
      ],
      endingMode: [
        storyOption("dignity_first_no_reunion", "Dignity first", "kết thúc ưu tiên phẩm giá, không đoàn tụ rẻ sau quá nhiều nhục mạ."),
        storyOption("he_needs_her_too_late", "He needs her back too late", "hắn cần cô khi cô đã thôi xem hắn là trung tâm."),
        storyOption("final_gala_she_leaves_first", "Gala cuối, cô rời đi trước", "màn cuối đảo vị thế: cô bước vào không ai đặt thấp được, rồi rời đi trước khi hắn gọi đó là yêu."),
      ],
    },
  };

  const STORY_CONTROL_OPTIONS = {
    betrayalType: [
      {
        value: RANDOM_STORY_CONTROL_VALUE,
        label: "Ngẫu nhiên",
        prompt: "",
      },
      {
        value: "hidden_girl_public_replacement",
        label: "Bị giấu kín rồi bị thay thế công khai",
        prompt: "phản bội bằng cách yêu nữ chính trong bóng tối nhưng công khai chọn người phụ nữ đúng giai tầng hơn.",
      },
      {
        value: "built_him_lost_him",
        label: "Cùng hắn đi lên rồi bị bỏ lại",
        prompt: "Nữ chính xây nền cho thành công của hắn, nhưng khi hắn có vị thế, hắn loại cô khỏi tương lai.",
      },
      {
        value: "best_friend_stole_lover",
        label: "Bạn thân cướp người yêu",
        prompt: "Bạn thân biết rõ vết thương của nữ chính rồi dùng chính niềm tin đó để cướp người yêu.",
      },
      {
        value: "family_chose_golden_child",
        label: "Gia đình chọn đứa con vàng",
        prompt: "Gia đình hy sinh nữ chính để bảo vệ đứa con được ưu ái và gọi đó là điều hợp lý.",
      },
      {
        value: "credit_theft_by_partner",
        label: "Bị người yêu cướp công",
        prompt: "Người yêu dùng chất xám của nữ chính để leo lên, rồi nhận hết công lao trước đám đông.",
      },
      {
        value: "contract_useful_woman_discarded",
        label: "Chỉ được giữ lại khi còn hữu ích",
        prompt: "Nữ chính nhận ra mình là người phụ nữ hữu ích trong một thỏa thuận lạnh, không phải người được chọn.",
      },
      {
        value: "wrong_woman_for_family",
        label: "Không đủ chuẩn nhà hắn",
        prompt: "Hắn không phủ nhận tình cảm riêng tư nhưng để gia đình khiến cô hiểu cô không đủ tư cách bước vào cửa.",
      },
      {
        value: "replacement_for_old_love",
        label: "Chỉ là bản thay thế",
        prompt: "Nữ chính tưởng mình là duy nhất, nhưng phát hiện cô chỉ là phiên bản thay thế cho người hắn thật sự muốn.",
      },
      {
        value: "secret_affair_scandal_shifted",
        label: "Bị đẩy thành kẻ chen chân",
        prompt: "Hắn giấu mối quan hệ thật, rồi khi scandal nổ ra, nữ chính bị đẩy thành kẻ không biết thân phận.",
      },
      {
        value: "public_denial_after_private_dependence",
        label: "Phụ thuộc riêng tư, phủ nhận công khai",
        prompt: "Hắn cần nữ chính mỗi khi yếu đuối nhưng phủ nhận vai trò của cô trước người có quyền lực.",
      },
    ],
    shameType: [
      {
        value: RANDOM_STORY_CONTROL_VALUE,
        label: "Ngẫu nhiên",
        prompt: "",
      },
      {
        value: "polite_class_exclusion",
        label: "Bị loại trừ lịch sự",
        prompt: "nhục mạ bằng phép lịch sự: không ai chửi, nhưng chỗ ngồi, lời giới thiệu và ánh mắt đều đặt cô thấp hơn.",
      },
      {
        value: "introduced_as_acquaintance",
        label: "Bị giới thiệu là người quen",
        prompt: "Người yêu giới thiệu nữ chính là người quen hoặc nhân viên hỗ trợ ở nơi đáng lẽ phải công khai cô.",
      },
      {
        value: "seat_card_staff_table",
        label: "Bị xếp vào bàn thấp hơn",
        prompt: "Nữ chính bị chuyển chỗ ngồi xuống bàn phụ, khu nhân viên hoặc vị trí khiến cả phòng hiểu cô không thuộc về.",
      },
      {
        value: "dress_code_humiliation",
        label: "Bị chê cách ăn mặc/nền tảng",
        prompt: "Nhục mạ qua dress code, cách nói, học vấn, xuất thân hoặc chi tiết tiền bạc rất nhỏ nhưng đau.",
      },
      {
        value: "pity_not_respect",
        label: "Bị thương hại thay vì tôn trọng",
        prompt: "Người giàu tiếp đón cô bằng lòng thương hại lịch sự, khiến mọi nỗ lực của cô bị hạ thành may mắn.",
      },
      {
        value: "competence_erased",
        label: "Bị xóa năng lực",
        prompt: "Cô làm việc thật nhưng người khác gọi đó là hỗ trợ nhỏ, khiến năng lực bị biến thành phông nền.",
      },
      {
        value: "media_scandal_scape_goat",
        label: "Bị đổ scandal",
        prompt: "Truyền thông, công ty hoặc gia đình hắn đẩy cô thành người gây rối để bảo vệ danh tiếng của người có quyền.",
      },
      {
        value: "family_gatekeeping",
        label: "Bị nhà hắn gác cổng",
        prompt: "Gia đình hắn không cấm trực tiếp mà dùng quy tắc, di sản, họ hàng và bữa ăn để dạy cô biết vị trí.",
      },
      {
        value: "invisible_labor",
        label: "Lao động vô hình",
        prompt: "Cô chăm sóc, vận hành, sửa lỗi và cứu người khác, nhưng không ai nhớ tên hoặc ghi nhận vai trò của cô.",
      },
      {
        value: "comparison_with_proper_woman",
        label: "Bị so với người phụ nữ đúng chuẩn",
        prompt: "Tình địch không cần ác; chỉ cần đúng chuẩn hơn để mọi ánh nhìn biến nữ chính thành lựa chọn sai.",
      },
    ],
    revengeMode: [
      {
        value: RANDOM_STORY_CONTROL_VALUE,
        label: "Ngẫu nhiên",
        prompt: "",
      },
      {
        value: "silent_comeback_status_reversal",
        label: "Silent comeback đảo vị thế",
        prompt: "trả đũa bằng silent comeback: nữ chính biến mất, xây lại giá trị, rồi trở lại ở vị thế khiến người từng coi thường cô phải xin quyền tiếp cận.",
      },
      {
        value: "withdraw_emotional_labor",
        label: "Rút lao động cảm xúc",
        prompt: "Cô không phá hoại; cô chỉ ngừng cứu, ngừng dỗ, ngừng làm nơi an toàn cho kẻ đã dùng cô.",
      },
      {
        value: "withdraw_operational_system",
        label: "Rút khỏi hệ thống vận hành",
        prompt: "Cô nghỉ hoặc rút tay khỏi phần vận hành mà mọi người tưởng tự nhiên tồn tại, khiến hệ thống lộ phụ thuộc.",
      },
      {
        value: "evidence_based_narrative_flip",
        label: "Lật narrative bằng bằng chứng",
        prompt: "Cô không bóc phốt cảm tính; cô dùng bằng chứng, bản nháp, log, hợp đồng hoặc thời điểm để lật câu chuyện.",
      },
      {
        value: "refuse_late_rescue",
        label: "Từ chối cứu hắn quá muộn",
        prompt: "Khi hắn cần cô cứu thương vụ, danh tiếng hoặc gia đình, cô đặt điều kiện hoặc từ chối vai hy sinh cũ.",
      },
      {
        value: "public_credit_reclaim",
        label: "Đòi lại công lao trước công chúng",
        prompt: "Cô lấy lại quyền tác giả/năng lực bằng một màn công khai đủ sạch, khiến kẻ cướp công không thể phản bác.",
      },
      {
        value: "new_alliance_power_room",
        label: "Bắt tay với phòng quyền lực mới",
        prompt: "Cô không trả đũa trực diện mà bước vào liên minh, nhà đầu tư, gia đình hoặc thế lực mà hắn từng muốn được chọn.",
      },
      {
        value: "make_him_wait_outside",
        label: "Bắt hắn đứng ngoài cánh cửa cũ",
        prompt: "Payoff là đảo nghi thức: người từng để cô chờ ngoài cửa giờ phải chờ để được cô cho vào.",
      },
      {
        value: "legal_contractual_turn",
        label: "Lật bằng hợp đồng/quyền pháp lý",
        prompt: "Cô dùng điều khoản, quyền sở hữu, chứng cứ hợp pháp hoặc cam kết cũ để giành lại thứ bị lấy.",
      },
      {
        value: "dignified_exit_no_speech",
        label: "Rời đi sạch, không diễn thuyết",
        prompt: "Trả đũa bằng sự vắng mặt: cô nói rất ít, rời đi đúng lúc, và để khoảng trống buộc họ hiểu giá trị đã mất.",
      },
    ],
    endingMode: [
      {
        value: RANDOM_STORY_CONTROL_VALUE,
        label: "Ngẫu nhiên",
        prompt: "",
      },
      {
        value: "dignity_first_no_reunion",
        label: "Phẩm giá trước tình yêu",
        prompt: "Kết thúc ưu tiên phẩm giá: nữ chính không tái hợp chỉ vì hắn hối hận muộn.",
      },
      {
        value: "bittersweet_clean_break",
        label: "Chia tay sạch, dư vị đắng",
        prompt: "Kết bittersweet: còn tình cảm hoặc ký ức, nhưng lựa chọn rời đi là điều trưởng thành nhất.",
      },
      {
        value: "he_needs_her_too_late",
        label: "Hắn cần cô quá muộn",
        prompt: "Hắn nhận ra giá trị của cô khi cô đã không còn đói tình yêu đến mức tự hạ mình.",
      },
      {
        value: "public_truth_private_grief",
        label: "Sự thật công khai, nỗi buồn riêng",
        prompt: "Sự thật được trả lại trước đám đông, nhưng nỗi đau thật được xử lý trong im lặng riêng tư.",
      },
      {
        value: "status_reversal_final_gala",
        label: "Gala cuối đảo vị thế",
        prompt: "Màn cuối ở một sự kiện xã hội: nữ chính bước vào như người không phòng nào còn đặt thấp được.",
      },
      {
        value: "revenge_without_cruelty",
        label: "Trả đũa không biến thành tàn nhẫn",
        prompt: "Cô thắng nhưng không trở thành phiên bản tàn nhẫn của người từng làm cô đau.",
      },
      {
        value: "new_love_optional",
        label: "Tình yêu mới chỉ là khả năng",
        prompt: "Nếu có tình yêu mới, nó chỉ là khả năng mở; trọng tâm vẫn là nữ chính tự xác nhận giá trị.",
      },
      {
        value: "family_bows_but_not_forgiven",
        label: "Gia đình cúi đầu nhưng không được tha dễ",
        prompt: "Gia đình hoặc tầng lớp từng khinh cô phải công nhận cô, nhưng sự công nhận không tự động mua được tha thứ.",
      },
      {
        value: "career_power_solidifies",
        label: "Quyền lực mới được củng cố",
        prompt: "Kết bằng năng lực và vị thế mới ổn định: cô không chỉ thắng một người, cô thoát khỏi cấu trúc cũ.",
      },
      {
        value: "quiet_self_naming",
        label: "Tự gọi tên mình",
        prompt: "Kết lặng: nữ chính tự gọi đúng giá trị của mình, không còn chờ người khác đặt tên hay chọn cô.",
      },
    ],
  };

  const MODE_LABELS = {
    idle: "Studio",
    outline: "Tạo outline",
    full: "Tạo toàn bộ truyện",
    seed: "Tự tạo thiết lập",
    automation: "Automation",
    chapter: "Tạo chương",
    regenerate: "Viết lại chương",
    markdown: "Xuất Markdown",
    chapterMarkdown: "Xuất từng chương",
    pdf: "Xuất PDF",
    save: "Lưu file",
    tts: "Gen voice",
  };

  const state = {
    currentStory: null,
    currentMarkdown: "",
    currentView: "overview",
    selectedChapterNumber: 1,
    storyBusy: false,
    restoring: false,
    sessionSaveTimer: null,
    lastConcreteLinePreset: DEFAULT_LINE_PRESET,
    generatedStoryControls: null,
    initPayload: null,
    routerSettings: null,
    automationConfig: null,
    prosePolishConfig: null,
    storyHistory: [],
    selectedHistoryId: "",
    ttsConfig: null,
    ttsVoices: [],
    ttsBusy: false,
    ttsProgress: null,
    ttsSession: null,
    progress: createIdleProgressState(),
    userTouchedLinePreset: false,
  };

  const elements = {
    titleHint: byId("title-hint"),
    linePreset: byId("line-preset"),
    customLinePreset: byId("custom-line-preset"),
    outputLanguage: byId("output-language"),
    settingSeedMode: byId("setting-seed-mode"),
    settingSeed: byId("setting-seed"),
    intensity: byId("intensity"),
    dialogueRatio: byId("dialogue-ratio"),
    hookDensity: byId("hook-density"),
    generateFullButton: byId("generate-full-button"),
    automationNicheSelect: byId("automation-niche-select"),
    automationStoryCount: byId("automation-story-count"),
    automationPdfDirectory: byId("automation-pdf-directory"),
    automationPdfBrowseButton: byId("automation-pdf-browse-button"),
    automationPdfSaveButton: byId("automation-pdf-save-button"),
    automationButton: byId("automation-button"),
    pauseRememberButton: byId("pause-remember-button"),
    autoFillSettingsButton: byId("auto-fill-settings-button"),
    storyTitle: byId("story-title"),
    metricChapters: byId("metric-chapters"),
    metricMode: byId("metric-mode"),
    metricRouter: byId("metric-router"),
    statusPill: byId("status-pill"),
    routerSettingsButton: byId("router-settings-button"),
    modelPresetSelect: byId("model-preset-select"),
    routerConfigHint: byId("router-config-hint"),
    routerSettingsModal: byId("router-settings-modal"),
    routerSettingsCloseButton: byId("router-settings-close-button"),
    nineRouterPath: byId("nine-router-path"),
    nineRouterBrowseButton: byId("nine-router-browse-button"),
    nineRouterSaveButton: byId("nine-router-save-button"),
    nineRouterStatus: byId("nine-router-status"),
    progressCaption: byId("progress-caption"),
    progressFill: byId("progress-fill"),
    progressStage: byId("progress-stage"),
    progressDetail: byId("progress-detail"),
    progressStepList: byId("progress-step-list"),
    overviewView: byId("overview-view"),
    planView: byId("plan-view"),
    chaptersView: byId("chapters-view"),
    targetChapter: byId("target-chapter"),
    regenerateMode: byId("regenerate-mode"),
    regenerateInstruction: byId("regenerate-instruction"),
    regenerateButton: byId("regenerate-button"),
    continueMissingChaptersButton: byId("continue-missing-chapters-button"),
    openStoryPosterButton: byId("open-story-poster-button"),
    saveChaptersMarkdownButton: byId("save-chapters-markdown-button"),
    saveStoryPdfButton: byId("save-story-pdf-button"),
    ttsStatus: byId("tts-status"),
    ttsApiBase: byId("tts-api-base"),
    saveTtsConfigButton: byId("save-tts-config-button"),
    refreshTtsVoicesButton: byId("refresh-tts-voices-button"),
    voiceIdSelect: byId("voice-id-select"),
    ttsSpeed: byId("tts-speed"),
    ttsPitch: byId("tts-pitch"),
    generateStoryVoiceButton: byId("generate-story-voice-button"),
    pauseStoryVoiceButton: byId("pause-story-voice-button"),
    stopStoryVoiceButton: byId("stop-story-voice-button"),
    resumeStoryVoiceButton: byId("resume-story-voice-button"),
    retryStoryVoiceButton: byId("retry-story-voice-button"),
    voiceProgress: byId("voice-progress"),
    renderAllButton: byId("render-all-button"),
    renderAllStatus: byId("render-all-status"),
    historyList: byId("history-list"),
    loadHistoryButton: byId("load-history-button"),
    openHistoryExportButton: byId("open-history-export-button"),
    deleteHistoryButton: byId("delete-history-button"),
    logConsole: byId("log-console"),
    segmentButtons: Array.from(document.querySelectorAll(".segment-button")),
  };

  normalizeStaticCopy();
  attachEvents();
  window.dramaStudio.onProgress(handleProgressEvent);
  window.dramaStudio.onTtsProgress?.(handleTtsProgressEvent);
  boot();

  async function boot() {
    try {
      const payload = await window.dramaStudio.init();
      state.initPayload = payload;
      state.routerSettings = payload.routerSettings || null;
      replaceNicheStoryControls(payload.storyControls || {});
      state.prosePolishConfig = payload.prosePolishConfig || null;
      applyAutomationConfig(payload.automationConfig || null);
      const ttsConfigResponse = await window.dramaStudio.getTtsConfig();
      applyTtsConfig(ttsConfigResponse?.data || null);
      const ttsSessionResponse = await window.dramaStudio.getTtsSession?.();
      state.ttsSession = ttsSessionResponse?.data || null;
      await loadOmniVoiceVoices(false);
      state.storyHistory = payload.storyHistory || [];
      populateSelect(elements.linePreset, payload.linePresets);
      populateSelect(
        elements.automationNicheSelect,
        [{ value: "__random__", label: "Ng\u1eabu nhi\u00ean (1 trong 10 niche)" }, ...payload.linePresets],
      );
      populateSelect(
        elements.outputLanguage,
        Object.entries(OUTPUT_LANGUAGE_LABELS).map(([value, label]) => ({ value, label })),
      );
      hydrateForm(payload.sampleOutlineRequest);
      restoreSavedSession(payload.savedSession);
      writeStatus(`Studio sẵn sàng. Thư mục cấu hình: ${payload.configRoot}`);
      elements.metricRouter.textContent = "chờ";
      elements.metricMode.textContent = "chờ";
      elements.statusPill.textContent = "Studio sẵn sàng";
      renderAll();
    } catch (error) {
      showError(error);
    }
  }

  function attachEvents() {
    elements.linePreset.addEventListener("change", () => {
      if (!state.restoring) {
        state.userTouchedLinePreset = true;
      }
      if (elements.linePreset.value !== CUSTOM_OPTION_VALUE) {
        state.lastConcreteLinePreset = elements.linePreset.value || DEFAULT_LINE_PRESET;
      }
      state.generatedStoryControls = null;
      syncCustomInputs();
      scheduleSessionSave();
    });

    [
      elements.titleHint,
      elements.customLinePreset,
      elements.outputLanguage,
      elements.settingSeed,
      elements.intensity,
      elements.dialogueRatio,
      elements.hookDensity,
      elements.regenerateInstruction,
    ].forEach((input) => {
      input.addEventListener("input", scheduleSessionSave);
      input.addEventListener("change", scheduleSessionSave);
    });

    elements.modelPresetSelect.addEventListener("change", async () => {
      const model = elements.modelPresetSelect.value;
      try {
        await window.dramaStudio.setModelPreset({ modelPreset: model });
        writeStatus(`Model đã đổi sang ${model}.`);
      } catch (error) {
        writeStatus(`Không đổi được model: ${translateErrorMessage(error?.message || error)}.`, true);
      }
    });

    elements.routerSettingsButton.addEventListener("click", () => {
      openRouterSettingsDialog();
    });

    elements.routerSettingsCloseButton.addEventListener("click", () => {
      closeRouterSettingsDialog();
    });

    elements.routerSettingsModal.addEventListener("click", (event) => {
      if (event.target === elements.routerSettingsModal) {
        closeRouterSettingsDialog();
      }
    });

    elements.nineRouterBrowseButton.addEventListener("click", async () => {
      await updateRouterSettings(async () => window.dramaStudio.chooseNineRouterDirectory());
    });

    elements.nineRouterSaveButton.addEventListener("click", async () => {
      await updateRouterSettings(async () =>
        window.dramaStudio.saveNineRouterDirectory({
          directoryPath: elements.nineRouterPath.value,
        }),
      );
    });

    elements.automationPdfBrowseButton.addEventListener("click", async () => {
      await updateAutomationConfig(async () => window.dramaStudio.chooseAutomationPdfDirectory());
    });

    elements.automationPdfSaveButton.addEventListener("click", async () => {
      await updateAutomationConfig(async () =>
        window.dramaStudio.saveAutomationConfig({
          pdfOutputDirectory: getAutomationPdfOutputDirectory(),
        }),
      );
    });

    elements.saveTtsConfigButton.addEventListener("click", async () => {
      try {
        await saveTtsConfig();
      } catch (error) {
        showError(error);
      }
    });

    elements.refreshTtsVoicesButton.addEventListener("click", async () => {
      try {
        await saveTtsConfig(false);
        await loadOmniVoiceVoices(true);
      } catch (error) {
        showError(error);
      }
    });

    elements.voiceIdSelect.addEventListener("change", () => {
      state.ttsConfig = {
        ...(state.ttsConfig || {}),
        selectedVoiceId: elements.voiceIdSelect.value,
      };
      scheduleSessionSave();
    });

    [elements.ttsApiBase, elements.ttsSpeed, elements.ttsPitch].forEach((input) => {
      input.addEventListener("input", scheduleSessionSave);
      input.addEventListener("change", scheduleSessionSave);
    });

    elements.generateStoryVoiceButton.addEventListener("click", async () => {
      await generateStoryVoice();
    });
    elements.pauseStoryVoiceButton.addEventListener("click", async () => {
      await controlStoryVoice("pause");
    });
    elements.stopStoryVoiceButton.addEventListener("click", async () => {
      await controlStoryVoice("stop");
    });
    elements.resumeStoryVoiceButton.addEventListener("click", async () => {
      await resumeStoryVoice();
    });
    elements.retryStoryVoiceButton.addEventListener("click", async () => {
      await retryStoryVoice();
    });

    elements.renderAllButton.addEventListener("click", async () => {
      if (elements.renderAllStatus) elements.renderAllStatus.textContent = "�ang m? Render All...";
      try {
        const result = await window.dramaStudio.launchRenderAll();
        if (elements.renderAllStatus) {
          elements.renderAllStatus.textContent = result.ok ? "�� m? FFmpeg Render Tool." : (result.error || "L?i m? tool.");
        }
      } catch (err) {
        if (elements.renderAllStatus) elements.renderAllStatus.textContent = String(err);
      }
    });

    elements.settingSeedMode.addEventListener("change", () => {
      syncSettingSeedMode();
      scheduleSessionSave();
    });

    elements.autoFillSettingsButton.addEventListener("click", async () => {
      await autoFillStorySettings();
    });

    elements.pauseRememberButton.addEventListener("click", async () => {
      await persistSession("manual-pause", false);
    });

    elements.generateFullButton.addEventListener("click", async () => {
      await runBusyTask("full", async () => {
        const response = await window.dramaStudio.generateFull(buildFullPayload());
        state.currentStory = response.data;
        state.currentMarkdown = "";
        applyStoryHistoryPayload(response);
        writeStatus(`Đã tạo toàn bộ truyện lúc ${response.meta.generatedAt}.`);
        renderAll();
      });
    });

    elements.automationButton.addEventListener("click", async () => {
      await runAutomationBatch();
    });

    elements.regenerateButton.addEventListener("click", async () => {
      if (!state.currentStory) {
        writeStatus("Hãy tạo truyện trước khi dùng chức năng viết lại chương.", true);
        return;
      }

      if (!hasDraftedChapters()) {
        writeStatus("Chỉ có thể viết lại chương sau khi Tạo toàn bộ truyện đã sinh xong bản thảo các chương.", true);
        return;
      }

      await runBusyTask("regenerate", async () => {
        const response = await window.dramaStudio.regenerateChapter({
          storyPayload: state.currentStory,
          targetChapter: Number(elements.targetChapter.value),
          mode: elements.regenerateMode.value,
          instruction: elements.regenerateInstruction.value.trim(),
          preserveConstraints: {
            preserveNames: true,
            preserveMainReveal: true,
            preserveEndingMode: true,
          },
        });

        state.currentStory = response.data.storyPayload;
        state.selectedChapterNumber = response.data.chapter.chapterNumber;
        writeStatus(`Đã viết lại chương ${response.data.chapter.chapterNumber}.`);
        renderAll();
      });
    });

    elements.continueMissingChaptersButton.addEventListener("click", async () => {
      await continueMissingChapters();
    });

    elements.openStoryPosterButton.addEventListener("click", async () => {
      await openCurrentStoryPoster();
    });

    elements.saveChaptersMarkdownButton.addEventListener("click", async () => {
      if (!hasDraftedChapters()) {
        writeStatus("Hãy tạo toàn bộ truyện trước khi lưu từng chương Markdown.", true);
        return;
      }

      await runBusyTask("chapterMarkdown", async () => {
        const result = await window.dramaStudio.saveChaptersMarkdown({
          storyPayload: state.currentStory,
        });

        if (result.canceled) {
          writeStatus("Đã hủy lưu từng chương Markdown.");
          return;
        }

        applyStoryHistoryPayload(result);
        writeStatus(`Đã lưu ${result.count} file chương tại ${result.directoryPath}.`);
      });
    });

    elements.saveStoryPdfButton.addEventListener("click", async () => {
      if (!hasDraftedChapters()) {
        writeStatus("Hãy tạo toàn bộ truyện trước khi xuất PDF.", true);
        return;
      }

      await runBusyTask("pdf", async () => {
        const result = await window.dramaStudio.saveStoryPdf({
          storyPayload: state.currentStory,
        });

        if (result.canceled) {
          writeStatus("Đã hủy xuất PDF.");
          return;
        }

        applyStoryHistoryPayload(result);
        writeStatus(`Đã xuất PDF tại ${result.filePath}.`);
      });
    });

    elements.loadHistoryButton.addEventListener("click", async () => {
      await loadSelectedStoryHistory();
    });

    elements.openHistoryExportButton.addEventListener("click", async () => {
      await openSelectedHistoryExport();
    });

    elements.deleteHistoryButton.addEventListener("click", async () => {
      await deleteSelectedStoryHistory();
    });

    elements.targetChapter.addEventListener("change", () => {
      state.selectedChapterNumber = Number(elements.targetChapter.value || 1);
      renderAll();
    });

    elements.segmentButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.currentView = button.dataset.view;
        renderAll();
      });
    });
  }

  async function runBusyTask(mode, task) {
    if (mode === "tts") {
      try {
        await task();
        scheduleSessionSave();
      } catch (error) {
        showError(error);
      }
      return;
    }

    if (state.storyBusy) {
      return;
    }

    state.storyBusy = true;
    syncButtons();
    prepareProgress(mode);
    elements.metricMode.textContent = formatModeLabel(mode);
    elements.statusPill.textContent = `Đang chạy ${formatModeLabel(mode).toLowerCase()}...`;
    syncButtons();
    renderProgress();

    try {
      await task();
      completeProgress(mode);
      scheduleSessionSave();
    } catch (error) {
      showError(error);
    } finally {
      state.storyBusy = false;
      elements.metricMode.textContent = "ch\u1edd";
      elements.statusPill.textContent = "Studio s\u1eb5n s\u00e0ng";
      syncButtons();
    }
  }

  function syncButtons() {
    const storyDisabled = state.storyBusy;
    if (!state.selectedHistoryId && state.storyHistory.length) {
      state.selectedHistoryId = state.storyHistory[0]?.id || "";
    }
    const regenerateDisabled = storyDisabled || !hasDraftedChapters();
    const continueDisabled = storyDisabled || !canContinueMissingChapters();
    const draftedExportDisabled = storyDisabled || !hasDraftedChapters();
    const historyActionDisabled = storyDisabled || !state.selectedHistoryId;
    const ttsActive = isActiveTtsSessionStatus(state.ttsSession?.status) || state.ttsBusy;
    const ttsPaused = state.ttsSession?.status === "paused" || state.ttsSession?.status === "pause-requested";
    const ttsCanResumeFromDisk = ["stopped", "failed"].includes(state.ttsSession?.status || "");
    const ttsControlsDisabled = storyDisabled || ttsActive;
    const ttsDisabled = ttsControlsDisabled || !hasCompleteDraftedStory() || !elements.voiceIdSelect.value;
    [
      elements.generateFullButton,
      elements.automationButton,
      elements.autoFillSettingsButton,
      elements.routerSettingsButton,
    ].forEach((button) => {
      button.disabled = storyDisabled;
    });
    elements.automationStoryCount.disabled = storyDisabled;
    elements.automationNicheSelect.disabled = storyDisabled;
    elements.automationPdfDirectory.disabled = storyDisabled;

    [
      elements.nineRouterBrowseButton,
      elements.nineRouterSaveButton,
      elements.automationPdfBrowseButton,
      elements.automationPdfSaveButton,
    ].forEach((button) => {
      button.disabled = storyDisabled;
    });

    elements.loadHistoryButton.disabled = historyActionDisabled;
    elements.openHistoryExportButton.disabled = historyActionDisabled || !getSelectedHistoryExportPath();
    elements.deleteHistoryButton.disabled = historyActionDisabled;
    elements.openStoryPosterButton.disabled = storyDisabled || !getCurrentPosterPath();
    elements.saveChaptersMarkdownButton.disabled = draftedExportDisabled;
    elements.saveStoryPdfButton.disabled = draftedExportDisabled;
    elements.generateStoryVoiceButton.disabled = ttsDisabled;
    elements.ttsApiBase.disabled = ttsControlsDisabled;
    elements.voiceIdSelect.disabled = ttsControlsDisabled || !state.ttsVoices.length;
    elements.ttsSpeed.disabled = ttsControlsDisabled;
    elements.ttsPitch.disabled = ttsControlsDisabled;
    elements.saveTtsConfigButton.disabled = ttsControlsDisabled;
    elements.refreshTtsVoicesButton.disabled = ttsControlsDisabled;
    elements.pauseStoryVoiceButton.disabled = storyDisabled || !["running"].includes(state.ttsSession?.status || "");
    elements.stopStoryVoiceButton.disabled = storyDisabled || !isActiveTtsSessionStatus(state.ttsSession?.status);
    elements.resumeStoryVoiceButton.disabled =
      storyDisabled ||
      !hasCompleteDraftedStory() ||
      !elements.voiceIdSelect.value ||
      (!ttsPaused && !ttsCanResumeFromDisk) ||
      (ttsActive && !ttsPaused);
    elements.retryStoryVoiceButton.disabled = storyDisabled || ttsActive || !hasCompleteDraftedStory() || !elements.voiceIdSelect.value;
    elements.regenerateButton.disabled = regenerateDisabled;
    elements.continueMissingChaptersButton.disabled = continueDisabled;
    elements.continueMissingChaptersButton.textContent = getContinueMissingChaptersButtonLabel();
    elements.targetChapter.disabled = regenerateDisabled;
    elements.regenerateMode.disabled = regenerateDisabled;
    elements.regenerateInstruction.disabled = regenerateDisabled;
  }

  function canContinueMissingChapters(story = state.currentStory) {
    return getFirstMissingChapterNumber(story) !== null;
  }

  function getContinueMissingChaptersButtonLabel(story = state.currentStory) {
    const nextChapter = getFirstMissingChapterNumber(story);
    if (!story) {
      return "Tiếp tục từ chương còn thiếu";
    }

    if (!nextChapter) {
      return "Đã đủ 10 chương";
    }

    return `Tiếp tục từ chương ${nextChapter}`;
  }

  async function continueMissingChapters() {
    const firstMissingChapter = getFirstMissingChapterNumber();
    if (!firstMissingChapter) {
      writeStatus("Không có chương còn thiếu để tạo tiếp.", true);
      return;
    }

    await runBusyTask("chapter", async () => {
      let nextChapter = getFirstMissingChapterNumber();
      while (nextChapter) {
        writeStatus(`Đang tạo tiếp chương ${nextChapter}.`);
        try {
          const response = await window.dramaStudio.generateChapter(buildContinueChapterPayload(nextChapter));
          const chapter = response?.data?.chapter;
          if (!chapter) {
            throw new Error(`Không nhận được dữ liệu chương ${nextChapter} từ engine.`);
          }

          state.currentStory = mergeGeneratedChapter(state.currentStory, chapter);
          state.selectedChapterNumber = chapter.chapterNumber;
          state.currentMarkdown = "";
          state.currentView = "chapters";
          writeStatus(`Đã tạo xong chương ${chapter.chapterNumber}.`);
          renderAll();
          await persistSession(`continued-chapter-${chapter.chapterNumber}`, true);
        } catch (error) {
          writeStatus(`Dừng ở chương ${nextChapter}. Các chương đã tạo trước đó vẫn được giữ lại.`, true);
          throw error;
        }

        nextChapter = getFirstMissingChapterNumber();
      }
    });
  }

  function getFirstMissingChapterNumber(story = state.currentStory) {
    if (!story?.chapterPlan?.length) {
      return null;
    }

    const draftedChapterNumbers = new Set((story.chapters || []).map((chapter) => Number(chapter.chapterNumber)));
    const missingPlanItem = [...story.chapterPlan]
      .sort((left, right) => Number(left.chapterNumber) - Number(right.chapterNumber))
      .find((chapter) => !draftedChapterNumbers.has(Number(chapter.chapterNumber)));

    return missingPlanItem ? Number(missingPlanItem.chapterNumber) : null;
  }

  function buildContinueChapterPayload(chapterNumber, story = state.currentStory) {
    if (!story) {
      throw new Error("Không có truyện hiện tại để tạo tiếp chương.");
    }

    return {
      storyTitle: story.title,
      outputLanguage: story.request?.outputLanguage || "english",
      storyBible: story.storyBible,
      chapterPlan: story.chapterPlan,
      chapterNumber,
      previousChapterSummaries: getPreviousChapterSummaries(story, chapterNumber),
      draftControls: story.request?.draftControls,
      stylePreset: story.request?.stylePreset,
      continuityLite: story.continuityLite,
    };
  }

  function getPreviousChapterSummaries(story, chapterNumber) {
    return (story.chapters || [])
      .filter((chapter) => Number(chapter.chapterNumber) < Number(chapterNumber))
      .sort((left, right) => Number(left.chapterNumber) - Number(right.chapterNumber))
      .map((chapter) => String(chapter.summary || "").trim())
      .filter(Boolean);
  }

  function mergeGeneratedChapter(story, chapter) {
    const chaptersByNumber = new Map(
      (story?.chapters || []).map((existingChapter) => [Number(existingChapter.chapterNumber), existingChapter]),
    );
    chaptersByNumber.set(Number(chapter.chapterNumber), chapter);

    return {
      ...story,
      chapters: [...chaptersByNumber.values()].sort(
        (left, right) => Number(left.chapterNumber) - Number(right.chapterNumber),
      ),
      meta: {
        ...(story.meta || {}),
        generatedAt: new Date().toISOString(),
      },
    };
  }

  function openRouterSettingsDialog() {
    const settings = state.routerSettings;
    elements.nineRouterPath.value = settings?.directoryPath || settings?.defaultDirectoryPath || "";
    renderRouterSettings();
    elements.routerSettingsModal.classList.remove("hidden");
    elements.nineRouterPath.focus();
  }

  function closeRouterSettingsDialog() {
    elements.routerSettingsModal.classList.add("hidden");
  }

  async function updateRouterSettings(action) {
    try {
      const result = await action();
      if (result?.canceled) {
        return;
      }

      if (!result?.ok) {
        throw new Error(result?.error || "9router settings were not saved.");
      }

      state.routerSettings = result.data;
      elements.nineRouterPath.value = result.data?.directoryPath || "";
      renderRouterSettings();
      writeStatus("ÄÃ£ cáº¥u hÃ¬nh 9router cho studio.");
    } catch (error) {
      showError(error);
    }
  }

  async function updateAutomationConfig(action) {
    try {
      const result = await action();
      if (result?.canceled) {
        return;
      }

      if (!result?.ok) {
        throw new Error(result?.error || "Không lưu được cấu hình Automation PDF.");
      }

      applyAutomationConfig(result.data);
      writeStatus(`Đã lưu thư mục PDF Automation: ${getAutomationPdfOutputDirectory()}`);
    } catch (error) {
      showError(error);
    }
  }

  function applyAutomationConfig(config) {
    state.automationConfig = config || null;
    elements.automationPdfDirectory.value = config?.pdfOutputDirectory || "";
  }

  function applyTtsConfig(config) {
    state.ttsConfig = config || {};
    elements.ttsApiBase.value = state.ttsConfig.apiBase || "http://127.0.0.1:8001";
    elements.ttsSpeed.value = String(state.ttsConfig.speed ?? 1);
    elements.ttsPitch.value = String(state.ttsConfig.pitch ?? 0);
    renderTtsVoices();
    renderTtsProgress();
  }

  async function saveTtsConfig(showStatus = true) {
    const response = await window.dramaStudio.saveTtsConfig({
      apiBase: elements.ttsApiBase.value,
      selectedVoiceId: elements.voiceIdSelect.value || state.ttsConfig?.selectedVoiceId || "",
      speed: Number(elements.ttsSpeed.value || 1),
      pitch: Number(elements.ttsPitch.value || 0),
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Không lưu được cấu hình voice.");
    }
    applyTtsConfig(response.data);
    if (showStatus) {
      writeStatus("Đã lưu cấu hình voice.");
    }
    return response.data;
  }

  async function loadOmniVoiceVoices(showStatus = true) {
    try {
      const response = await window.dramaStudio.listTtsVoices();
      if (!response?.ok) {
        throw new Error(response?.error || "Không tải được Voice ID từ OmniVoice.");
      }
      state.ttsVoices = response.data || [];
      elements.ttsStatus.textContent = `${state.ttsVoices.length} voice`;
      renderTtsVoices();
      syncButtons();
      if (showStatus) {
        writeStatus(`Đã tải ${state.ttsVoices.length} Voice ID từ OmniVoice.`);
      }
    } catch (error) {
      state.ttsVoices = [];
      elements.ttsStatus.textContent = "Lỗi kết nối";
      renderTtsVoices();
      syncButtons();
      if (showStatus) {
        writeStatus(`OmniVoice lỗi: ${translateErrorMessage(error?.message || error)}`, true);
      }
    }
  }

  function renderTtsVoices() {
    if (!elements.voiceIdSelect) {
      return;
    }

    if (!state.ttsVoices.length) {
      elements.voiceIdSelect.innerHTML = '<option value="">Chưa có Voice ID</option>';
      elements.voiceIdSelect.value = "";
      return;
    }

    const selected =
      state.ttsConfig?.selectedVoiceId ||
      elements.voiceIdSelect.value ||
      state.ttsVoices[0]?.voiceId ||
      "";
    elements.voiceIdSelect.innerHTML = state.ttsVoices
      .map((voice) => `<option value="${escapeHtml(voice.voiceId)}">${escapeHtml(voice.name)} | ${escapeHtml(voice.voiceId)}</option>`)
      .join("");
    elements.voiceIdSelect.value = state.ttsVoices.some((voice) => voice.voiceId === selected)
      ? selected
      : state.ttsVoices[0].voiceId;
  }

  function hydrateForm(request) {
    elements.titleHint.value = request.titleHint || "";
    state.lastConcreteLinePreset = normalizeLinePresetValue(request.linePreset || DEFAULT_LINE_PRESET);
    elements.linePreset.value = request.customCreativeInputs?.dramaBranch ? CUSTOM_OPTION_VALUE : state.lastConcreteLinePreset;
    elements.outputLanguage.value = request.outputLanguage || "english";
    elements.settingSeedMode.value = "custom";
    elements.settingSeed.value = request.settingSeed || "";
    state.generatedStoryControls = request.storyControls || null;
    applyCustomCreativeInputsToForm(request.customCreativeInputs);
    syncSettingSeedMode();
    syncCustomInputs();
    elements.intensity.value = String(request.storyControls?.intensity ?? 0.84);
    elements.dialogueRatio.value = "0.55";
    elements.hookDensity.value = "high";
    elements.regenerateInstruction.value = "Tăng nhục mạ giai cấp theo kiểu lịch sự và siết sắc câu kết.";
  }

  function buildOutlinePayload(linePresetOverride) {
    const linePreset = normalizeLinePresetValue(linePresetOverride || getSelectedLinePresetValue());

    return {
      titleHint: elements.titleHint.value.trim(),
      linePreset,
      stylePreset: getSelectedStylePresetValue(linePreset),
      outputLanguage: elements.outputLanguage.value,
      audience: {
        genderFocus: "female",
        ageBand: "18_34",
        market: "global",
      },
      storyControls: buildAutoStoryControls(linePreset),
      customCreativeInputs: collectCustomCreativeInputs(),
      settingSeed: resolveSettingSeedValue(),
      chapterCount: 10,
    };
  }

  function buildFullPayload() {
    return {
      ...buildOutlinePayload(),
      draftControls: {
        dialogueRatio: Number(elements.dialogueRatio.value),
        hookDensity: elements.hookDensity.value,
      },
    };
  }

  function buildSeedPayload() {
    const seedLinePreset = resolveAutoFillLinePreset();
    const seedPayload = {
      ...buildOutlinePayload(seedLinePreset),
      storyControls: buildAutoStoryControls(seedLinePreset, { ignoreGenerated: true }),
      settingSeed: elements.settingSeed.value.trim() || undefined,
    };
    delete seedPayload.titleHint;
    return seedPayload;
  }

  function getAutomationStoryCount(rawValue = elements.automationStoryCount.value) {
    const count = Number.parseInt(String(rawValue ?? "").trim(), 10);
    if (!Number.isFinite(count)) {
      return DEFAULT_AUTOMATION_STORY_COUNT;
    }

    return Math.max(MIN_AUTOMATION_STORY_COUNT, Math.min(MAX_AUTOMATION_STORY_COUNT, count));
  }

  function getAutomationPdfOutputDirectory() {
    return String(elements.automationPdfDirectory.value || "").trim();
  }

  function buildAutomationSeedPayload(linePreset) {
    const normalizedLinePreset = normalizeLinePresetValue(linePreset || DEFAULT_LINE_PRESET);
    const seedPayload = {
      ...buildOutlinePayload(normalizedLinePreset),
      storyControls: buildAutoStoryControls(normalizedLinePreset, { ignoreGenerated: true }),
      settingSeed: SETTING_SEED_RANDOM_PROMPT,
      customCreativeInputs: undefined,
    };
    delete seedPayload.titleHint;
    return seedPayload;
  }

  function buildAutomationFullPayload(seedPackage, fallbackLinePreset = DEFAULT_LINE_PRESET) {
    const linePreset = normalizeLinePresetValue(seedPackage?.linePreset || fallbackLinePreset || DEFAULT_LINE_PRESET);
    return {
      titleHint: seedPackage?.titleHint || "",
      linePreset,
      stylePreset: getSelectedStylePresetValue(linePreset),
      outputLanguage: elements.outputLanguage.value || "english",
      audience: {
        genderFocus: "female",
        ageBand: "18_34",
        market: "global",
      },
      storyControls: seedPackage?.storyControls || buildAutoStoryControls(linePreset, { ignoreGenerated: true }),
      settingSeed: seedPackage?.settingSeed || SETTING_SEED_RANDOM_PROMPT,
      chapterCount: 10,
      draftControls: {
        dialogueRatio: Number(seedPackage?.draftControls?.dialogueRatio ?? elements.dialogueRatio.value ?? 0.55),
        hookDensity: seedPackage?.draftControls?.hookDensity || elements.hookDensity.value || "high",
      },
    };
  }

  function getSelectedLinePresetValue() {
    return elements.linePreset.value === CUSTOM_OPTION_VALUE ? getActiveDramaBranchId() : elements.linePreset.value;
  }

  function getSelectedStylePresetValue(linePresetOverride) {
    return `${normalizeLinePresetValue(linePresetOverride || getActiveDramaBranchId())}__${DEFAULT_STYLE_LENS}`;
  }

  function resolveAutoFillLinePreset() {
    if (state.userTouchedLinePreset || elements.linePreset.value === CUSTOM_OPTION_VALUE) {
      return getSelectedLinePresetValue();
    }

    return pickAutoFillLinePreset();
  }

  function pickAutoFillLinePreset(random = Math.random) {
    const presets = Object.keys(nicheStoryControls);
    if (!presets.length) {
      return DEFAULT_LINE_PRESET;
    }
    const randomValue = Number(random());
    const safeRandom = Number.isFinite(randomValue) ? Math.min(0.999_999, Math.max(0, randomValue)) : 0;
    const index = Math.floor(safeRandom * presets.length);
    return presets[index] || DEFAULT_LINE_PRESET;
  }

  function collectCustomCreativeInputs() {
    const customInputs = {
      dramaBranch: elements.linePreset.value === CUSTOM_OPTION_VALUE ? elements.customLinePreset.value.trim() : "",
    };
    const entries = Object.entries(customInputs).filter(([, value]) => value.length > 0);

    return entries.length ? Object.fromEntries(entries) : undefined;
  }

  function applyCustomCreativeInputsToForm(customInputs = {}) {
    elements.customLinePreset.value = customInputs?.dramaBranch || "";

    if (customInputs?.dramaBranch) {
      elements.linePreset.value = CUSTOM_OPTION_VALUE;
    }
  }

  function syncCustomInputs() {
    toggleCustomInput(elements.customLinePreset, elements.linePreset.value === CUSTOM_OPTION_VALUE);
  }

  function toggleCustomInput(input, visible) {
    input.classList.toggle("hidden", !visible);
    input.disabled = !visible;
  }

  function applySelectOrCustom(select, customInput, rawValue) {
    const value = String(rawValue || "").trim();
    if (!value) {
      return false;
    }

    const match = Array.from(select.options).find((option) => {
      const optionLabel = option.textContent || "";
      return option.value === value || optionLabel.trim().toLowerCase() === value.toLowerCase();
    });

    if (match && match.value !== CUSTOM_OPTION_VALUE) {
      select.value = match.value;
      customInput.value = "";
      return true;
    }

    select.value = CUSTOM_OPTION_VALUE;
    customInput.value = value;
    return false;
  }

  function applyGeneratedSeedPackage(seedPackage, options = {}) {
    if (!seedPackage) {
      return;
    }

    elements.titleHint.value = seedPackage.titleHint || "";
    const requestedCustomLinePreset = String(options.requestedCustomLinePreset || "").trim();
    const linePresetForForm = requestedCustomLinePreset || seedPackage.linePreset;
    const matchedLinePreset = applySelectOrCustom(elements.linePreset, elements.customLinePreset, linePresetForForm);
    if (matchedLinePreset) {
      state.lastConcreteLinePreset = elements.linePreset.value || state.lastConcreteLinePreset;
    }
    state.generatedStoryControls = seedPackage.storyControls || null;
    elements.settingSeedMode.value = "custom";
    elements.settingSeed.value = seedPackage.settingSeed || "";
    elements.intensity.value = String(seedPackage.storyControls?.intensity ?? elements.intensity.value);
    elements.dialogueRatio.value = String(seedPackage.draftControls?.dialogueRatio ?? elements.dialogueRatio.value);
    elements.hookDensity.value = seedPackage.draftControls?.hookDensity || elements.hookDensity.value;
    syncSettingSeedMode();
    syncCustomInputs();
  }

  async function autoFillStorySettings() {
    await runBusyTask("seed", async () => {
      const seedPayload = buildSeedPayload();
      const requestedCustomLinePreset = seedPayload.customCreativeInputs?.dramaBranch || "";
      const response = await window.dramaStudio.generateSettingSeed(seedPayload);
      applyGeneratedSeedPackage(response.data, { requestedCustomLinePreset });
      writeStatus(`Đã tự tạo toàn bộ thiết lập truyện bằng ${response.meta.modelUsed}.`);
      await persistSession("settings-generated", true);
      renderAll();
    });
  }

  async function saveGeneratedStoryPdf(storyPayload) {
    try {
      const result = await window.dramaStudio.autoSaveStoryPdf({
        storyPayload,
        outputDirectory: getAutomationPdfOutputDirectory(),
      });

      if (!result?.ok) {
        throw new Error(result?.error || "Không tự lưu được PDF.");
      }

      applyStoryHistoryPayload(result);
      writeStatus(`Đã tự lưu PDF Automation tại ${result.filePath}.`);
      return result;
    } catch (error) {
      writeStatus(`Tự lưu PDF Automation lỗi: ${translateErrorMessage(error?.message || error)}`, true);
      return null;
    }
  }

  async function generateStoryVoice(mode = "full", chapterNumber = null) {
    if (!hasCompleteDraftedStory()) {
      writeStatus("Cần đủ 10 chương đã draft trước khi gen voice.", true);
      return;
    }

    if (!elements.voiceIdSelect.value) {
      writeStatus("Chọn Voice ID trước khi gen voice.", true);
      return;
    }

    await runBusyTask("tts", async () => {
      state.ttsBusy = true;
      state.ttsProgress = null;
      state.ttsSession = {
        status: "running",
        mode,
        currentChapter: chapterNumber || 0,
        totalChapters: 10,
        message: mode === "resume"
          ? "Đang chạy tiếp voice từ file còn thiếu."
          : mode === "retry"
            ? `Đang retry voice chương ${chapterNumber}.`
            : "Đang gen voice 10 chương.",
      };
      syncButtons();
      renderTtsProgress();
      try {
        const result = await window.dramaStudio.generateStoryVoice({
          storyPayload: state.currentStory,
          voiceId: elements.voiceIdSelect.value,
          speed: Number(elements.ttsSpeed.value || 1),
          pitch: Number(elements.ttsPitch.value || 0),
          mode,
          chapterNumber,
        });
        if (!result?.ok) {
          state.ttsSession = result?.data || result?.session || state.ttsSession;
          throw new Error(result?.error || "Gen voice lỗi.");
        }

        state.ttsSession = result.session || {
          ...state.ttsSession,
          status: result.data?.status === "stopped" ? "stopped" : "completed",
          directoryPath: result.data?.directoryPath,
          filePaths: result.data?.filePaths || [],
        };
        applyStoryHistoryPayload(result);
        if (result.data?.status === "stopped") {
          writeStatus(`Đã dừng gen voice. Giữ ${result.data.filePaths.length} file tại ${result.data.directoryPath}.`);
        } else {
          writeStatus(`Đã gen ${result.data.filePaths.length} file voice tại ${result.data.directoryPath}.`);
        }
      } finally {
        state.ttsBusy = false;
      }
      renderAll();
    });
  }

  async function controlStoryVoice(action) {
    try {
      const response = await window.dramaStudio.controlStoryVoice({ action });
      if (!response?.ok) {
        throw new Error(response?.error || "Không điều khiển được voice.");
      }
      state.ttsSession = response.data || state.ttsSession;
      writeStatus(state.ttsSession?.message || `Đã gửi lệnh ${action}.`);
      syncButtons();
      renderTtsProgress();
    } catch (error) {
      showError(error);
    }
  }

  async function resumeStoryVoice() {
    if (state.ttsSession?.status === "paused" || state.ttsSession?.status === "pause-requested") {
      await controlStoryVoice("resume");
      return;
    }

    await generateStoryVoice("resume");
  }

  async function retryStoryVoice() {
    await generateStoryVoice("retry", getRetryVoiceChapterNumber());
  }

  function handleTtsProgressEvent(event) {
    state.ttsProgress = event;
    const pendingStatus = state.ttsSession?.status;
    state.ttsSession = {
      ...(state.ttsSession || {}),
      status: event.status === "paused" || event.status === "stopped" || event.status === "failed"
        ? event.status
        : pendingStatus === "pause-requested" || pendingStatus === "stop-requested"
          ? pendingStatus
        : "running",
      currentChapter: event.chapterNumber,
      totalChapters: event.totalChapters,
      message: event.message,
    };
    renderTtsProgress();
    syncButtons();
  }

  function renderTtsProgress() {
    if (!elements.voiceProgress) {
      return;
    }

    if (!state.ttsProgress) {
      elements.voiceProgress.textContent = state.ttsSession?.message || "Chưa chạy voice.";
      return;
    }

    const event = state.ttsProgress;
    elements.voiceProgress.textContent =
      `Chương ${event.chapterNumber}/10 · ${Number(event.progress) || 0}% · ${normalizeDisplayText(event.message)}`;
  }

  function isActiveTtsSessionStatus(status) {
    return ["running", "pause-requested", "paused", "stop-requested"].includes(status || "");
  }

  function getRetryVoiceChapterNumber() {
    if (["failed", "stopped"].includes(state.ttsSession?.status || "") && state.ttsSession?.currentChapter) {
      return Number(state.ttsSession.currentChapter);
    }

    return Number(state.selectedChapterNumber || state.ttsProgress?.chapterNumber || 1);
  }

  async function runAutomationBatch() {
    await runBusyTask("automation", async () => {
      const count = getAutomationStoryCount();
      elements.automationStoryCount.value = String(count);
      let successCount = 0;
      let failureCount = 0;

      for (let index = 0; index < count; index += 1) {
        const storyNumber = index + 1;
        const automationNiche = elements.automationNicheSelect?.value || "__random__";
        const linePreset = automationNiche === "__random__" ? pickAutoFillLinePreset() : automationNiche;
        const nicheLabel = formatSelectOptionLabel("line-preset", linePreset);
        writeStatus(`Automation ${storyNumber}/${count}: tự tạo thiết lập cho ${nicheLabel}.`);

        try {
          const seedResponse = await window.dramaStudio.generateSettingSeed(buildAutomationSeedPayload(linePreset));
          const seedPackage = seedResponse.data;
          applyGeneratedSeedPackage(seedPackage);
          writeStatus(`Automation ${storyNumber}/${count}: đang viết full truyện "${seedPackage.titleHint || nicheLabel}".`);

          const fullResponse = await window.dramaStudio.generateFull(
            buildAutomationFullPayload(seedPackage, linePreset),
          );
          state.currentStory = fullResponse.data;
          state.currentMarkdown = "";
          state.currentView = "overview";
          applyStoryHistoryPayload(fullResponse);
          await saveGeneratedStoryPdf(fullResponse.data);
          successCount += 1;
          writeStatus(`Automation ${storyNumber}/${count}: đã tạo xong "${fullResponse.data?.title || seedPackage.titleHint || nicheLabel}".`);
          renderAll();
          await persistSession(`automation-story-${storyNumber}`, true);
        } catch (error) {
          failureCount += 1;
          writeStatus(`Automation ${storyNumber}/${count} lỗi: ${translateErrorMessage(error?.message || error)}`, true);
        }
      }

      writeStatus(`Automation hoàn tất: ${successCount}/${count} bộ thành công, ${failureCount} bộ lỗi.`);
    });
  }

  function applyStoryHistoryPayload(payload) {
    if (payload?.storyHistory) {
      state.storyHistory = payload.storyHistory;
    }
    if (payload?.historyEntry?.id) {
      state.selectedHistoryId = payload.historyEntry.id;
    }
  }

  async function refreshStoryHistory() {
    const response = await window.dramaStudio.listStoryHistory();
    if (response?.data) {
      state.storyHistory = response.data;
      if (!state.storyHistory.some((entry) => entry.id === state.selectedHistoryId)) {
        state.selectedHistoryId = state.storyHistory[0]?.id || "";
      }
    }
    renderAll();
  }

  async function loadSelectedStoryHistory() {
    if (!state.selectedHistoryId) {
      writeStatus("Chưa chọn bộ nào trong lịch sử.", true);
      return;
    }

    const response = await window.dramaStudio.loadStoryHistoryEntry({
      id: state.selectedHistoryId,
    });
    if (!response?.ok || !response?.data?.storyPayload) {
      throw new Error(response?.error || "Không mở được bộ đã lưu trong lịch sử.");
    }

    state.currentStory = response.data.storyPayload;
    state.currentMarkdown = "";
    state.currentView = hasDraftedChapters() ? "chapters" : "overview";
    state.selectedChapterNumber = Number(state.currentStory.chapters?.[0]?.chapterNumber) || 1;
    writeStatus(`Đã mở lại bộ "${response.data.title}".`);
    renderAll();
    await persistSession("history-load", true);
  }

  async function deleteSelectedStoryHistory() {
    if (!state.selectedHistoryId) {
      return;
    }

    const response = await window.dramaStudio.deleteStoryHistoryEntry({
      id: state.selectedHistoryId,
    });
    if (!response?.ok && !response?.deleted) {
      throw new Error(response?.error || "Không xóa được mục lịch sử.");
    }

    state.storyHistory = response.storyHistory || [];
    state.selectedHistoryId = state.storyHistory[0]?.id || "";
    writeStatus("Đã xóa mục lịch sử đã chọn.");
    renderAll();
  }

  async function openSelectedHistoryExport() {
    const targetPath = getSelectedHistoryExportPath();
    if (!targetPath) {
      writeStatus("M?c l?ch s? n?y ch?a c? file export.", true);
      return;
    }

    const response = await window.dramaStudio.openStoryHistoryPath({
      path: targetPath,
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Không mở được đường dẫn export.");
    }
  }

  async function openCurrentStoryPoster() {
    const targetPath = getCurrentPosterPath();
    if (!targetPath) {
      writeStatus("Truyện hiện tại chưa có poster để mở.", true);
      return;
    }

    const response = await window.dramaStudio.openStoryHistoryPath({
      path: targetPath,
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Không mở được poster.");
    }
  }

  function getSelectedHistoryEntry() {
    return state.storyHistory.find((entry) => entry.id === state.selectedHistoryId) || null;
  }

  function getCurrentPosterPath(story = state.currentStory) {
    return story?.meta?.poster?.status === "completed" ? story.meta.poster.filePath || "" : "";
  }

  function formatPosterImageSrc(filePath) {
    const normalized = String(filePath || "").replace(/\\/g, "/");
    const encoded = encodeURI(normalized).replace(/#/g, "%23");
    if (/^[A-Za-z]:\//.test(normalized)) {
      return `file:///${encoded}`;
    }

    if (normalized.startsWith("/")) {
      return `file://${encoded}`;
    }

    return encoded;
  }

  function getSelectedHistoryExportPath() {
    const entry = getSelectedHistoryEntry();
    if (!entry?.exports) {
      return "";
    }

    return (
      entry.exports.chapterMarkdownDirectories?.[0]?.directoryPath ||
      entry.exports.pdfFiles?.[0]?.filePath ||
      entry.exports.voiceDirectories?.[0]?.directoryPath ||
      entry.exports.posterImages?.[0]?.filePath ||
      ""
    );
  }

  function renderAll() {
    syncCustomInputs();
    syncButtons();
    renderMetrics();
    renderProgress();
    renderViewSegments();
    renderOverview();
    renderPlan();
    renderChapters();
    renderChapterOptions();
    renderRouterSettings();
    renderTtsProgress();
    renderStoryHistory();
  }

  function renderMetrics() {
    if (!state.currentStory) {
      elements.storyTitle.textContent = "Chưa có truyện nào";
      elements.metricChapters.textContent = "0";
      return;
    }

    elements.storyTitle.textContent = state.currentStory.title;
    elements.metricChapters.textContent = String(state.currentStory.chapterPlan.length);
    elements.metricRouter.textContent = state.currentStory.meta?.modelAliases?.planner || "router";
  }

  function renderRouterSettings() {
    const settings = state.routerSettings;
    const label = formatRouterSettingsLabelFixed(settings);
    const detail = formatRouterSettingsDetailFixed(settings);

    elements.routerConfigHint.textContent = detail;
    elements.nineRouterStatus.textContent = detail;

    if (!state.currentStory) {
      elements.metricRouter.textContent = label;
    }
  }

  function renderStoryHistory() {
    if (!state.storyHistory.length) {
      elements.historyList.innerHTML = '<div class="empty-state compact-empty">Chưa có bộ nào được lưu.</div>';
      return;
    }

    if (!state.selectedHistoryId || !state.storyHistory.some((entry) => entry.id === state.selectedHistoryId)) {
      state.selectedHistoryId = state.storyHistory[0]?.id || "";
    }

    elements.historyList.innerHTML = state.storyHistory
      .map((entry) => {
        const updatedAt = formatDateTime(entry.updatedAt || entry.createdAt);
        const exportCount =
          Number(entry.exports?.chapterMarkdownDirectories?.length || 0) +
          Number(entry.exports?.pdfFiles?.length || 0) +
          Number(entry.exports?.voiceDirectories?.length || 0) +
          Number(entry.exports?.posterImages?.length || 0);
        return `
          <button class="history-item ${entry.id === state.selectedHistoryId ? "active" : ""}" data-history-id="${escapeHtml(entry.id)}" type="button">
            <strong>${escapeHtml(entry.title)}</strong>
            <span>${escapeHtml(formatSelectOptionLabel("line-preset", entry.linePreset))}</span>
            <small>${entry.chapterCount} chương · ${exportCount} export · ${escapeHtml(updatedAt)}</small>
          </button>
        `;
      })
      .join("");

    elements.historyList.querySelectorAll("[data-history-id]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedHistoryId = button.dataset.historyId || "";
        renderAll();
      });
    });
  }

  function renderProgress() {
    const progress = state.progress;
    const percent = getProgressPercent(progress);

    elements.progressCaption.textContent = progress.total
      ? `${formatModeLabel(progress.operation)} ${progress.current}/${progress.total}`
      : "Chờ";
    elements.progressFill.style.width = `${percent}%`;
    elements.progressStage.textContent = normalizeDisplayText(progress.label);
    elements.progressDetail.textContent = normalizeDisplayText(progress.detail);

    if (!progress.steps.length) {
      elements.progressStepList.innerHTML = '<div class="progress-empty">Chưa có lượt chạy nào đang hoạt động.</div>';
      return;
    }

    elements.progressStepList.innerHTML = progress.steps
      .map(
        (step) => `
          <article class="progress-step ${step.status}">
            <div class="progress-step-index">${step.current}</div>
            <div class="progress-step-body">
              <div class="progress-step-label">${escapeHtml(normalizeDisplayText(step.label))}</div>
              <div class="progress-step-detail">${escapeHtml(normalizeDisplayText(step.detail || ""))}</div>
            </div>
          </article>
        `,
      )
      .join("");
  }

  function renderViewSegments() {
    elements.segmentButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.view === state.currentView);
    });

    const views = {
      overview: elements.overviewView,
      plan: elements.planView,
      chapters: elements.chaptersView,
    };

    Object.entries(views).forEach(([viewName, element]) => {
      element.classList.toggle("hidden", viewName !== state.currentView);
    });
  }

  function renderOverview() {
    if (!state.currentStory) {
      elements.overviewView.innerHTML = emptyState("Hãy tạo toàn bộ truyện để xem kết quả tại đây.");
      return;
    }

    const story = state.currentStory;
    elements.overviewView.innerHTML = `
      <div class="story-grid">
        ${renderPosterPreview(story)}
        <article class="story-block">
          <h3>Concept</h3>
          <p><strong>Logline:</strong> ${escapeHtml(story.concept.logline)}</p>
          <p><strong>Lời hứa cảm xúc:</strong> ${escapeHtml(story.concept.promise)}</p>
          <p><strong>Engine xung đột:</strong> ${escapeHtml(story.concept.conflictEngine)}</p>
          <p><strong>Ngôn ngữ đầu ra:</strong> ${escapeHtml(formatOutputLanguageLabel(story.request.outputLanguage))}</p>
        </article>
        <article class="story-block">
          <h3>Nhân Vật Chính</h3>
          <ul>
            <li><strong>Nữ chính:</strong> ${escapeHtml(story.storyBible.heroine.name)} - ${escapeHtml(story.storyBible.heroine.wound)}</li>
            <li><strong>Kẻ phản bội:</strong> ${escapeHtml(story.storyBible.betrayer.name)} - ${escapeHtml(story.storyBible.betrayer.wound)}</li>
            <li><strong>Tình địch:</strong> ${escapeHtml(story.storyBible.rival.name)} - ${escapeHtml(story.storyBible.rival.socialPower)}</li>
          </ul>
        </article>
        <article class="story-block full">
          <h3>Engine Cốt Truyện</h3>
          <p><strong>Premise:</strong> ${escapeHtml(story.storyBible.premise)}</p>
          <p><strong>Nhục mạ giai cấp:</strong> ${escapeHtml(story.storyBible.classShameEngine)}</p>
          <p><strong>Trả đũa:</strong> ${escapeHtml(story.storyBible.revengeEngine)}</p>
          <p><strong>Kiểu kết thúc:</strong> ${escapeHtml(story.storyBible.endingMode)}</p>
        </article>
      </div>
    `;
  }

  function renderPosterPreview(story) {
    const poster = story.meta?.poster;
    if (!poster) {
      return "";
    }

    if (poster.status === "completed" && poster.filePath) {
      return `
        <article class="story-block full poster-preview">
          <div>
            <h3>Poster</h3>
            <p>${escapeHtml(poster.title || story.title)} · ${escapeHtml(poster.model)} · ${escapeHtml(poster.size)}</p>
          </div>
          <img class="poster-image" src="${escapeHtml(formatPosterImageSrc(poster.filePath))}" alt="${escapeHtml(poster.title || story.title)} poster" />
        </article>
      `;
    }

    return `
      <article class="story-block full poster-preview">
        <div>
          <h3>Poster</h3>
          <p>${escapeHtml(poster.status)}${poster.error ? ` · ${escapeHtml(poster.error)}` : ""}</p>
        </div>
      </article>
    `;
  }

  function renderPlan() {
    if (!state.currentStory) {
      elements.planView.innerHTML = emptyState("Kiến trúc từng chương sẽ xuất hiện tại đây sau khi tạo outline.");
      return;
    }

    elements.planView.innerHTML = `
      <div class="chapter-list">
        ${state.currentStory.chapterPlan
          .map(
            (chapter) => `
              <article class="chapter-card">
                <h4>Chương ${chapter.chapterNumber} - ${escapeHtml(chapter.title)}</h4>
                <p><strong>Hook:</strong> ${escapeHtml(chapter.hook)}</p>
                <p><strong>Nhịp chính:</strong> ${escapeHtml(chapter.mainBeat)}</p>
                <p><strong>Nhục mạ:</strong> ${escapeHtml(chapter.humiliationProgression)}</p>
                <p><strong>Trả đũa:</strong> ${escapeHtml(chapter.revengeProgression)}</p>
                <p><strong>Nhịp kết:</strong> ${escapeHtml(chapter.endingBeat)}</p>
              </article>
            `,
          )
          .join("")}
      </div>
    `;
  }

  function renderChapters() {
    if (!state.currentStory) {
      elements.chaptersView.innerHTML = emptyState("Hãy tạo toàn bộ truyện hoặc viết lại chương để đọc bản thảo tại đây.");
      return;
    }

    if (!state.currentStory.chapters || state.currentStory.chapters.length === 0) {
      elements.chaptersView.innerHTML = emptyState("Chưa có bản thảo chương nào. Hãy chạy Tạo toàn bộ truyện trước.");
      return;
    }

    const selectedChapter =
      state.currentStory.chapters.find((chapter) => chapter.chapterNumber === state.selectedChapterNumber) ||
      state.currentStory.chapters[0];
    elements.chaptersView.innerHTML = `
      <div class="story-grid">
        <aside class="story-block">
          <h3>Danh Sách Chương</h3>
          <div class="chapter-list compact-chapter-list">
            ${state.currentStory.chapters
              .map(
                (chapter) => `
                  <article class="chapter-card ${chapter.chapterNumber === selectedChapter.chapterNumber ? "active" : ""}">
                    <button class="chapter-select-button" data-chapter-select="${chapter.chapterNumber}" type="button">
                      <h4>${chapter.chapterNumber}</h4>
                      <p>${escapeHtml(chapter.title)}</p>
                    </button>
                  </article>
                `,
              )
              .join("")}
          </div>
        </aside>
        <article class="story-block full">
          <div class="chapter-reader-head">
            <h3>${escapeHtml(selectedChapter.title)}</h3>
          </div>
          <p>${escapeHtml(selectedChapter.text).replace(/\n/g, "<br />")}</p>
        </article>
      </div>
    `;

    elements.chaptersView.querySelectorAll("[data-chapter-select]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedChapterNumber = Number(button.dataset.chapterSelect);
        elements.targetChapter.value = String(state.selectedChapterNumber);
        renderAll();
      });
    });
  }

  function renderChapterOptions() {
    const chapters = hasDraftedChapters() ? state.currentStory.chapters : state.currentStory?.chapterPlan || [];
    const selectedValue = String(state.selectedChapterNumber || 1);
    elements.targetChapter.innerHTML = chapters
      .map(
        (chapter) =>
          `<option value="${chapter.chapterNumber}" ${String(chapter.chapterNumber) === selectedValue ? "selected" : ""}>${chapter.chapterNumber} - ${escapeHtml(chapter.title)}</option>`,
      )
      .join("");
  }

  function populateSelect(select, options) {
    const normalizedOptions = shouldOfferCustomOption(select.id)
      ? [
          ...options,
          {
            value: CUSTOM_OPTION_VALUE,
            label: CUSTOM_OPTION_LABEL,
          },
        ]
      : options;

    select.innerHTML = normalizedOptions
      .map((option) => {
        if (typeof option === "string") {
          return `<option value="${escapeHtml(option)}">${escapeHtml(formatSelectOptionLabel(select.id, option))}</option>`;
        }

        return `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`;
      })
      .join("");
  }

  function getActiveDramaBranchId() {
    if (elements.linePreset.value === CUSTOM_OPTION_VALUE) {
      return normalizeLinePresetValue(state.lastConcreteLinePreset || DEFAULT_LINE_PRESET);
    }

    return normalizeLinePresetValue(elements.linePreset.value || state.lastConcreteLinePreset || DEFAULT_LINE_PRESET);
  }

  function normalizeLinePresetValue(value) {
    const key = String(value || "").trim();
    return LEGACY_LINE_PRESET_MIGRATIONS[key] || key || DEFAULT_LINE_PRESET;
  }

  function getBranchStyleOptions(branchId) {
    const orderedLensIds = BRANCH_STYLE_LENS_ORDER[branchId] || STYLE_LENSES.map((lens) => lens.value);
    const uniqueLensIds = uniqueValues(orderedLensIds);

    return uniqueLensIds
      .map((lensId) => STYLE_LENSES.find((lens) => lens.value === lensId))
      .filter(Boolean)
      .map((lens) => ({
        value: `${branchId}__${lens.value}`,
        label: lens.label,
      }));
  }

  function resolveBranchStyleValue(branchId, preferredValue) {
    const options = getBranchStyleOptions(branchId);
    const exactMatch = options.find((option) => option.value === preferredValue);
    if (exactMatch) {
      return exactMatch.value;
    }

    const lensId = getStyleLensId(preferredValue);
    const branchScopedMatch = options.find((option) => option.value === `${branchId}__${lensId}`);
    if (branchScopedMatch) {
      return branchScopedMatch.value;
    }

    return options[0]?.value || "";
  }

  function getStyleLensId(stylePresetValue) {
    if (!stylePresetValue) {
      return "";
    }

    if (String(stylePresetValue).includes("__")) {
      return String(stylePresetValue).split("__").pop();
    }

    return LEGACY_STYLE_LENS_BY_PRESET[stylePresetValue] || "";
  }

  function syncSettingSeedMode() {
    const randomMode = elements.settingSeedMode.value === RANDOM_SETTING_SEED_VALUE;
    elements.settingSeed.disabled = randomMode;
    elements.settingSeed.placeholder = randomMode ? SETTING_SEED_RANDOM_PLACEHOLDER : SETTING_SEED_CUSTOM_PLACEHOLDER;
  }

  function resolveSettingSeedValue(
    mode = elements.settingSeedMode.value,
    customSeed = elements.settingSeed.value,
  ) {
    return mode === RANDOM_SETTING_SEED_VALUE ? SETTING_SEED_RANDOM_PROMPT : String(customSeed ?? "").trim();
  }

  function buildAutoStoryControls(branchId, options = {}) {
    if (!options.ignoreGenerated && state.generatedStoryControls) {
      return {
        ...state.generatedStoryControls,
        intensity: Number(elements.intensity.value || state.generatedStoryControls.intensity || 0.84),
      };
    }

    const controls = getNicheStoryControls(branchId);
    return {
      betrayalType: pickStoryPrompt(controls.betrayalType),
      shameType: pickStoryPrompt(controls.shameType),
      revengeMode: pickStoryPrompt(controls.revengeMode),
      endingMode: pickStoryPrompt(controls.endingMode),
      intensity: Number(elements.intensity.value || 0.84),
    };
  }

  function getNicheStoryControls(branchId) {
    return nicheStoryControls[branchId] || nicheStoryControls[DEFAULT_LINE_PRESET] || {
      betrayalType: [],
      shameType: [],
      revengeMode: [],
      endingMode: [],
    };
  }

  function replaceNicheStoryControls(nextControls) {
    Object.keys(nicheStoryControls).forEach((key) => {
      delete nicheStoryControls[key];
    });
    Object.assign(nicheStoryControls, nextControls || {});
  }

  function pickStoryPrompt(options) {
    if (!options?.length) {
      return "";
    }

    const option = options[Math.floor(Math.random() * options.length)];
    return option?.prompt || option?.label || option?.value || "";
  }

  function pickRandomStoryControlOption(options) {
    const concreteOptions = options.filter((option) => option.value !== RANDOM_STORY_CONTROL_VALUE);
    if (!concreteOptions.length) {
      return null;
    }

    return concreteOptions[Math.floor(Math.random() * concreteOptions.length)];
  }

  function storyOption(value, label, prompt) {
    return { value, label, prompt };
  }

  function uniqueValues(values) {
    return [...new Set(values)];
  }

  function formatSelectOptionLabel(selectId, value) {
    return SELECT_OPTION_LABELS[selectId]?.[value] || humanizeOptionValue(value);
  }

  function shouldOfferCustomOption(selectId) {
    return [
      "line-preset",
    ].includes(selectId);
  }

  function humanizeOptionValue(value) {
    return String(value)
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function buildSessionSnapshot() {
    return {
      form: {
        titleHint: elements.titleHint.value,
        linePresetSelection: elements.linePreset.value,
        baseLinePreset: getActiveDramaBranchId(),
        baseStylePreset: getSelectedStylePresetValue(),
        userTouchedLinePreset: state.userTouchedLinePreset,
        outputLanguage: elements.outputLanguage.value,
        settingSeedMode: elements.settingSeedMode.value,
        settingSeed: elements.settingSeed.value,
        generatedStoryControls: state.generatedStoryControls,
        customCreativeInputs: collectCustomCreativeInputs(),
        intensity: elements.intensity.value,
        dialogueRatio: elements.dialogueRatio.value,
        hookDensity: elements.hookDensity.value,
        automationStoryCount: elements.automationStoryCount.value,
        regenerateInstruction: elements.regenerateInstruction.value,
      },
      currentStory: state.currentStory,
      currentMarkdown: state.currentMarkdown,
      currentView: state.currentView,
      selectedChapterNumber: state.selectedChapterNumber,
      progress: state.progress,
    };
  }

  function restoreSavedSession(savedSession) {
    const snapshot = savedSession?.snapshot;
    if (!snapshot?.form) {
      syncCustomInputs();
      return;
    }

    const form = snapshot.form;
    state.restoring = true;
    state.lastConcreteLinePreset = normalizeLinePresetValue(form.baseLinePreset || form.linePresetSelection || DEFAULT_LINE_PRESET);
    state.userTouchedLinePreset = Boolean(form.userTouchedLinePreset);
    elements.titleHint.value = form.titleHint || "";
    elements.linePreset.value = normalizeLinePresetValue(form.linePresetSelection || state.lastConcreteLinePreset);
    elements.outputLanguage.value = form.outputLanguage || "english";
    elements.settingSeedMode.value = form.settingSeedMode || "custom";
    elements.settingSeed.value = form.settingSeed || "";
    state.generatedStoryControls = form.generatedStoryControls || null;
    applyCustomCreativeInputsToForm(form.customCreativeInputs);
    elements.intensity.value = form.intensity || elements.intensity.value;
    elements.dialogueRatio.value = form.dialogueRatio || elements.dialogueRatio.value;
    elements.hookDensity.value = form.hookDensity || elements.hookDensity.value;
    elements.automationStoryCount.value = form.automationStoryCount || elements.automationStoryCount.value || String(DEFAULT_AUTOMATION_STORY_COUNT);
    elements.regenerateInstruction.value = form.regenerateInstruction || elements.regenerateInstruction.value;
    state.currentStory = snapshot.currentStory || null;
    state.currentMarkdown = snapshot.currentMarkdown || "";
    state.currentView = ["overview", "plan", "chapters"].includes(snapshot.currentView) ? snapshot.currentView : "overview";
    state.selectedChapterNumber = Number(snapshot.selectedChapterNumber) || 1;
    state.progress = snapshot.progress || createIdleProgressState();
    syncSettingSeedMode();
    syncCustomInputs();
    state.restoring = false;
    writeStatus("\u0110\u00e3 kh\u00f4i ph\u1ee5c phi\u00ean l\u00e0m vi\u1ec7c \u0111\u00e3 l\u01b0u.");
  }

  function scheduleSessionSave() {
    if (state.restoring) {
      return;
    }

    window.clearTimeout(state.sessionSaveTimer);
    state.sessionSaveTimer = window.setTimeout(() => {
      void persistSession("auto-save", true);
    }, SESSION_SAVE_DEBOUNCE_MS);
  }

  async function persistSession(reason, silent) {
    try {
      const result = await window.dramaStudio.saveSession({
        reason,
        ...buildSessionSnapshot(),
      });
      if (!silent) {
        writeStatus("\u0110\u00e3 l\u01b0u phi\u00ean. L\u1ea7n sau m\u1edf tool, d\u1eef li\u1ec7u c\u0169 s\u1ebd \u0111\u01b0\u1ee3c kh\u00f4i ph\u1ee5c.");
      }

      return result;
    } catch (error) {
      if (!silent) {
        showError(error);
      }

      return null;
    }
  }

  function normalizeStaticCopy() {
    elements.pauseRememberButton.textContent = "T\u1ea1m D\u1eebng & Nh\u1edb";
  }

  function normalizeDisplayText(value) {
    let text = String(value ?? "");
    if (!/[ÃÂÄ]/.test(text) || typeof TextDecoder === "undefined") {
      return text;
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const bytes = Uint8Array.from(Array.from(text, (char) => char.charCodeAt(0) & 0xff));
      const decoded = new TextDecoder("utf-8").decode(bytes);
      if (!decoded || decoded === text) {
        break;
      }

      text = decoded;
      if (!/[ÃÂÄ]/.test(text)) {
        break;
      }
    }

    return text;
  }

  function writeStatus(message, isError = false) {
    const line = document.createElement("div");
    line.className = `log-line${isError ? " error" : ""}`;
    line.textContent = `${new Date().toLocaleTimeString("vi-VN")} - ${normalizeDisplayText(translateErrorMessage(message))}`;
    elements.logConsole.prepend(line);
  }

  function showError(error) {
    const message = error?.message || error?.error?.message || "Unknown desktop error.";
    const translatedMessage = translateErrorMessage(message);
    markProgressError(translatedMessage);
    writeStatus(translatedMessage, true);
  }

  function prepareProgress(mode) {
    state.progress = {
      operation: mode,
      status: "running",
      current: 0,
      total: 0,
      label: `Đang chuẩn bị ${formatModeLabel(mode).toLowerCase()}`,
      detail: "Đã gửi yêu cầu. Đang chờ stage đầu tiên của engine bắt đầu.",
      steps: [],
    };
  }

  function completeProgress(mode) {
    if (state.progress.operation !== mode) {
      return;
    }

    state.progress.status = "success";
    if (state.progress.total > 0) {
      state.progress.current = state.progress.total;
    }
    state.progress.label = `${formatModeLabel(mode)} hoàn tất`;
    state.progress.detail = "Tất cả stage đã chạy xong. Kết quả mới nhất đang được hiển thị trong studio.";
    renderProgress();
  }

  function markProgressError(message) {
    if (!state.progress || state.progress.operation === "idle") {
      return;
    }

    state.progress.status = "error";
    state.progress.label = `${formatModeLabel(state.progress.operation)} thất bại`;
    state.progress.detail = message;

    const activeStep = [...state.progress.steps].reverse().find((step) => step.status === "active");
    if (activeStep) {
      activeStep.status = "error";
      activeStep.detail = message;
    }

    renderProgress();
  }

  function handleProgressEvent(event) {
    if (!event || !event.operation) {
      return;
    }

    state.progress.operation = event.operation;
    state.progress.status = "running";
    state.progress.current = Math.max(state.progress.current, Number(event.current) || 0);
    state.progress.total = Math.max(state.progress.total, Number(event.total) || 0);
    state.progress.label = event.label || "Đang chạy";
    state.progress.detail = event.detail || "";

    const existingStep = state.progress.steps.find((step) => step.id === event.stageId);
    if (existingStep) {
      existingStep.label = event.label;
      existingStep.detail = event.detail;
      existingStep.current = event.current;
      existingStep.status = event.status === "completed" ? "done" : "active";
    } else {
      state.progress.steps.push({
        id: event.stageId,
        label: event.label,
        detail: event.detail,
        current: event.current,
        status: event.status === "completed" ? "done" : "active",
      });
    }

    state.progress.steps.forEach((step) => {
      if (step.id === event.stageId) {
        return;
      }

      if (step.current < event.current && step.status !== "error") {
        step.status = "done";
      }
    });

    state.progress.steps.sort((left, right) => left.current - right.current);

    if (event.storyPayload) {
      state.currentStory = event.storyPayload;
      state.currentMarkdown = "";
      if (event.chapter?.chapterNumber) {
        state.selectedChapterNumber = event.chapter.chapterNumber;
      }
      scheduleSessionSave();
    }

    if (event.status === "started") {
      elements.statusPill.textContent = `${formatModeLabel(event.operation)} ${event.current}/${event.total} - ${event.label}`;
      writeStatus(`${event.label}: ${event.detail}`);
    }

    if (event.storyPayload) {
      renderAll();
    } else {
      renderProgress();
    }
  }

  function getProgressPercent(progress) {
    if (!progress.total) {
      return 0;
    }

    const base = progress.status === "running" ? progress.current - 0.45 : progress.current;
    return Math.max(4, Math.min(100, (base / progress.total) * 100));
  }

  function formatModeLabel(mode) {
    return MODE_LABELS[mode] || "Studio";
  }

  function createIdleProgressState() {
    return {
      operation: "idle",
      status: "idle",
      current: 0,
      total: 0,
      label: "Đang chờ lượt chạy tiếp theo.",
      detail: "Hãy tạo outline hoặc toàn bộ truyện để xem tiến độ theo từng stage tại đây.",
      steps: [],
    };
  }

  function hasDraftedChapters() {
    return Boolean(state.currentStory?.chapters && state.currentStory.chapters.length > 0);
  }

  function hasCompleteDraftedStory() {
    const chapterNumbers = new Set((state.currentStory?.chapters || []).map((chapter) => Number(chapter.chapterNumber)));
    return Array.from({ length: 10 }, (_, index) => index + 1).every((chapterNumber) => chapterNumbers.has(chapterNumber));
  }

  function emptyState(message) {
    return `<div class="empty-state">${escapeHtml(message)}</div>`;
  }

  function formatOutputLanguageLabel(value) {
    return OUTPUT_LANGUAGE_LABELS[value] || OUTPUT_LANGUAGE_LABELS.english;
  }

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  }

  function formatRouterSettingsLabelFixed(settings) {
    if (!settings) {
      return "ch\u01b0a c\u1ea5u h\u00ecnh";
    }

    if (settings.status === "connected") {
      return "9router";
    }

    if (settings.status === "invalid") {
      return "l\u1ed7i";
    }

    return settings.source === "env" ? "env" : "ch\u1edd";
  }

  function formatRouterSettingsDetailFixed(settings) {
    if (!settings) {
      return "9router ch\u01b0a c\u1ea5u h\u00ecnh.";
    }

    if (settings.status === "connected") {
      return `9router \u0111\u00e3 k\u1ebft n\u1ed1i: ${settings.directoryPath || ""}`;
    }

    if (settings.status === "invalid") {
      return `Kh\u00f4ng \u0111\u1ecdc \u0111\u01b0\u1ee3c 9router: ${translateErrorMessage(settings.message)}`;
    }

    if (settings.hasApiKey) {
      return "\u0110ang d\u00f9ng c\u1ea5u h\u00ecnh .env. B\u1ea5m 9R \u0111\u1ec3 ch\u1ecdn th\u01b0 m\u1ee5c 9router.";
    }

    return "Ch\u01b0a c\u00f3 9router ho\u1eb7c .env h\u1ee3p l\u1ec7. B\u1ea5m 9R \u0111\u1ec3 ch\u1ecdn th\u01b0 m\u1ee5c 9router.";
  }

  function formatRouterSettingsLabel(settings) {
    if (!settings) {
      return "chÆ°a cáº¥u hÃ¬nh";
    }

    if (settings.status === "connected") {
      return "9router";
    }

    if (settings.status === "invalid") {
      return "lá»—i";
    }

    return settings.source === "env" ? "env" : "chá»";
  }

  function formatRouterSettingsDetail(settings) {
    if (!settings) {
      return "9router chÆ°a cáº¥u hÃ¬nh.";
    }

    if (settings.status === "connected") {
      return `9router Ä‘Ã£ káº¿t ná»‘i: ${settings.directoryPath || ""}`;
    }

    if (settings.status === "invalid") {
      return `KhÃ´ng Ä‘á»c Ä‘Æ°á»£c 9router: ${translateErrorMessage(settings.message)}`;
    }

    if (settings.hasApiKey) {
      return "Äang dÃ¹ng cáº¥u hÃ¬nh .env. Báº¥m 9R Ä‘á»ƒ chá»n thÆ° má»¥c 9router.";
    }

    return "ChÆ°a cÃ³ 9router hoáº·c .env há»£p lá»‡. Báº¥m 9R Ä‘á»ƒ chá»n thÆ° má»¥c 9router.";
  }

  function translateErrorMessage(message) {
    const source = String(message || "").trim();

    if (!source) {
      return "Đã xảy ra lỗi không xác định.";
    }

    const translations = [
      [/^Unknown desktop error\.$/i, "Lỗi desktop không xác định."],
      [/^Request validation failed\.$/i, "Dữ liệu yêu cầu không hợp lệ."],
      [/^Router returned HTTP (\d+)\.$/i, "Router trả về HTTP $1."],
      [/^Router request timed out\.$/i, "Router quá thời gian chờ. Với chương 2500 từ, model có thể cần vài phút; hãy thử lại hoặc tăng ROUTER_CHAPTER_TIMEOUT_MS nếu router đang chạy chậm."],
      [/^Story payload does not contain chapter (\d+)\.$/i, "Story payload không chứa chương $1."],
      [/^Story payload does not define chapter (\d+) in the chapter plan\.$/i, "Story payload không có chương $1 trong outline."],
      [/^Chapter (\d+) has not been drafted yet\. Generate Full Story before using Regenerate Chapter\.$/i, "Chương $1 chưa được tạo bản thảo. Hãy bấm Tạo toàn bộ truyện trước khi dùng Viết lại chương."],
      [/^Chapter (\d+) still failed quality thresholds after (\d+) repair attempts: (.+)\.$/i, "Chương $1 vẫn chưa đạt quality gate sau $2 lần sửa: $3."],
      [/^chapterCount must be 10$/i, "chapterCount phải bằng 10."],
    ];

    for (const [pattern, replacement] of translations) {
      if (pattern.test(source)) {
        return source.replace(pattern, replacement);
      }
    }

    return source;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
