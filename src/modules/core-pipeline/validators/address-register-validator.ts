/**
 * Deterministic Vietnamese address-register validator.
 *
 * Flags mixed self-reference (Tôi/Anh) and mixed vocatives (anh/cậu) within a chapter.
 */

import type { OutputLanguage } from "../../../types/story";
import type { AddressRegisterMap } from "../address-register";
import {
  detectSelfReferenceInDialogue,
  expectedSelfReferenceKeys,
  extractAttributedDialogues,
  normalizeTerm,
  selfReferenceKey,
} from "../address-register";

export const ADDRESS_REGISTER_FAILURE = "address register is inconsistent within chapter";

export interface AddressRegisterViolation {
  character: string;
  kind: "self_reference" | "address_term";
  terms: string[];
  expected: string;
  excerpt: string;
}

export interface AddressRegisterAnalysis {
  violations: AddressRegisterViolation[];
  needsRepair: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const CONFLICTING_ADDRESS_GROUPS = [
  ["anh", "cậu"],
  ["chị", "cô"],
];

function conflictingAddressTerms(expectedCall: string): string[] {
  const normalized = normalizeTerm(expectedCall);
  const group = CONFLICTING_ADDRESS_GROUPS.find((terms) => terms.includes(normalized));
  return group ?? [normalized];
}

function detectAddressTermsInLine(line: string, expectedCall: string): Set<string> {
  const terms = new Set<string>();
  for (const term of conflictingAddressTerms(expectedCall)) {
    const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, "i");
    if (pattern.test(line)) {
      terms.add(normalizeTerm(term));
    }
  }
  return terms;
}

export function analyzeAddressRegister(
  text: string,
  registers: AddressRegisterMap,
  outputLanguage?: OutputLanguage,
): AddressRegisterAnalysis {
  if (outputLanguage !== "vietnamese" || Object.keys(registers).length === 0) {
    return { violations: [], needsRepair: false };
  }

  const characterNames = Object.keys(registers);
  const violations: AddressRegisterViolation[] = [];
  const attributed = extractAttributedDialogues(text, characterNames);

  const selfRefsBySpeaker = new Map<string, Set<string>>();
  const addressTermsByPair = new Map<string, Set<string>>();

  for (const { speaker, line } of attributed) {
    const register = registers[speaker];
    if (!register) continue;

    const selfRefs = detectSelfReferenceInDialogue(line, register);
    if (selfRefs.length > 0) {
      const keys = selfRefsBySpeaker.get(speaker) ?? new Set<string>();
      for (const term of selfRefs) {
        const key = selfReferenceKey(term);
        if (key) keys.add(key);
      }
      selfRefsBySpeaker.set(speaker, keys);
    }

    for (const forbidden of register.forbiddenTerms) {
      const forbiddenPattern = new RegExp(`\\b${escapeRegExp(forbidden)}\\b`, "i");
      if (forbiddenPattern.test(line)) {
        violations.push({
          character: speaker,
          kind: "self_reference",
          terms: [forbidden],
          expected: register.selfReference,
          excerpt: line.slice(0, 160),
        });
      }
    }

    for (const [target, targetRegister] of Object.entries(register.toOthers)) {
      const expectedCall = normalizeTerm(targetRegister.call);
      const pairKey = `${speaker}::${target}`;
      const terms = addressTermsByPair.get(pairKey) ?? new Set<string>();
      for (const term of detectAddressTermsInLine(line, targetRegister.call)) {
        terms.add(term);
      }
      addressTermsByPair.set(pairKey, terms);
    }
  }

  for (const [speaker, keys] of selfRefsBySpeaker) {
    const register = registers[speaker];
    if (!register) continue;

    const allowed = expectedSelfReferenceKeys(register);
    const usedKeys = [...keys];
    const unexpected = usedKeys.filter((key) => !allowed.has(key));
    const hasMix = usedKeys.length > 1;

    if (hasMix || unexpected.length > 0) {
      violations.push({
        character: speaker,
        kind: "self_reference",
        terms: usedKeys,
        expected: register.selfReference,
        excerpt: attributed
          .filter((entry) => entry.speaker === speaker)
          .map((entry) => entry.line)
          .join(" | ")
          .slice(0, 160),
      });
    }
  }

  for (const [pairKey, terms] of addressTermsByPair) {
    if (terms.size <= 1) continue;

    const [speaker, target] = pairKey.split("::");
    const register = registers[speaker];
    const targetRegister = register?.toOthers[target];
    if (!register || !targetRegister) continue;

    const expected = normalizeTerm(targetRegister.call);
    if (terms.has(expected) && [...terms].some((term) => term !== expected)) {
      violations.push({
        character: speaker,
        kind: "address_term",
        terms: [...terms],
        expected: targetRegister.call,
        excerpt: attributed
          .filter((entry) => entry.speaker === speaker)
          .map((entry) => entry.line)
          .join(" | ")
          .slice(0, 160),
      });
    }
  }

  const deduped = dedupeViolations(violations);

  return {
    violations: deduped,
    needsRepair: deduped.length > 0,
  };
}

function dedupeViolations(violations: AddressRegisterViolation[]): AddressRegisterViolation[] {
  const seen = new Set<string>();
  const results: AddressRegisterViolation[] = [];

  for (const violation of violations) {
    const key = `${violation.character}:${violation.kind}:${violation.terms.join(",")}:${violation.expected}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(violation);
  }

  return results;
}
