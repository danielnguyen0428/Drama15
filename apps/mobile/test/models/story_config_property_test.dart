// Property-based test khứ hồi JSON cho `StoryConfig` (Req 3.10).
//
// Feature: flutter-drama-mobile-app, Property 6: StoryConfig khứ hồi qua JSON

import 'package:glados/glados.dart';

import 'package:drama15_mobile/models/story_config.dart';

void main() {
  // storyControls (tùy chọn): hoặc null, hoặc một bộ điều khiển bất kỳ.
  final controlsGen = any
      .combine5<String, String, String, String, double, StoryControls>(
        any.nonEmptyLowercaseLetters,
        any.nonEmptyLowercaseLetters,
        any.nonEmptyLowercaseLetters,
        any.nonEmptyLowercaseLetters,
        any.doubleInRange(0, 1),
        (b, s, r, e, i) => StoryControls(
          betrayalType: b,
          shameType: s,
          revengeMode: r,
          endingMode: e,
          intensity: i,
        ),
      )
      .nullable;

  final nicheGen = any.choose<String>(kNiches.map((n) => n.value).toList());
  final languageGen = any.choose<OutputLanguage>(OutputLanguage.values);

  final configGen = any
      .combine10<
        String,
        String,
        String,
        OutputLanguage,
        double,
        double,
        double,
        String,
        StoryControls?,
        String,
        StoryConfig
      >(
        nicheGen,
        any.lowercaseLetters, // customNiche (cho phép rỗng)
        any.lowercaseLetters, // title (cho phép rỗng)
        languageGen,
        any.doubleInRange(0, 1), // intensity
        any.doubleInRange(0.2, 0.85), // dialogueRatio
        any.doubleInRange(0, 1), // hookDensity
        any.nonEmptyLowercaseLetters, // stylePreset (phải không rỗng)
        controlsGen,
        any.lowercaseLetters, // seed (cho phép rỗng)
        (
          niche,
          customNiche,
          title,
          lang,
          intensity,
          dialogue,
          hook,
          stylePreset,
          controls,
          seed,
        ) {
          return StoryConfig(
            niche: niche,
            customNiche: customNiche,
            title: title,
            seed: seed,
            outputLanguage: lang,
            intensity: intensity,
            dialogueRatio: dialogue,
            hookDensity: hook,
            stylePreset: stylePreset,
            storyControls: controls,
          );
        },
      );

  Glados<StoryConfig>(configGen, ExploreConfig(numRuns: 100)).test(
    'StoryConfig.fromJson(toJson()) tương đương bản gốc',
    (config) {
      expect(StoryConfig.fromJson(config.toJson()), config);
    },
  );
}
