/**
 * Vocabulary Matrix helpers (Batch 6I-1)
 *
 * Foundation + admin UI only. Parent home learning, Weekly planner,
 * Monthly planner and AI prompts continue to use the existing
 * `theme_bank.key_vocabulary` JSON for now. Switch-over lands in 6I-3.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WordType =
  | "theme_word"
  | "action_word"
  | "concept_word"
  | "social_word"
  | "feeling_word"
  | "instruction_word"
  | "descriptive_word"
  | "question_word";

export type VocabularyLevel = "receptive" | "expressive" | "extension";

export const WORD_TYPES: { value: WordType; label: string }[] = [
  { value: "theme_word", label: "Theme word" },
  { value: "action_word", label: "Action word" },
  { value: "concept_word", label: "Concept word" },
  { value: "social_word", label: "Social word" },
  { value: "feeling_word", label: "Feeling word" },
  { value: "instruction_word", label: "Instruction word" },
  { value: "descriptive_word", label: "Descriptive word" },
  { value: "question_word", label: "Question word" },
];

export const VOCAB_LEVELS: { value: VocabularyLevel; label: string }[] = [
  { value: "receptive", label: "Receptive (understands)" },
  { value: "expressive", label: "Expressive (uses in speech)" },
  { value: "extension", label: "Extension (stretch word)" },
];

export type VocabularyEntry = {
  id: string;
  age_profile_id: string;
  domain_id: string | null;
  theme_id: string | null;
  objective_id: string | null;
  english_word: string | null;
  bm_word: string | null;
  word_type: WordType;
  vocabulary_level: VocabularyLevel;
  parent_example_sentence_en: string | null;
  parent_example_sentence_bm: string | null;
  teacher_prompt_en: string | null;
  teacher_prompt_bm: string | null;
  activity_context: string | null;
  active_status: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

const TABLE = "curriculum_vocabulary" as const;

export function useVocabularyByAge(ageProfileId: string | null) {
  return useQuery({
    queryKey: ["vocabulary", "by-age", ageProfileId],
    enabled: !!ageProfileId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from(TABLE)
        .select("*")
        .eq("age_profile_id", ageProfileId)
        .order("sort_order")
        .order("english_word");
      if (error) throw error;
      return (data ?? []) as VocabularyEntry[];
    },
  });
}

/** Integration helper — vocabulary for a given theme (parent / AI ready). */
export async function getVocabularyByTheme(themeId: string) {
  const { data, error } = await (supabase as any)
    .from(TABLE)
    .select("*")
    .eq("theme_id", themeId)
    .eq("active_status", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as VocabularyEntry[];
}

/** Integration helper — vocabulary by domain / objective for AI prompts. */
export async function getVocabularyByObjective(objectiveId: string) {
  const { data, error } = await (supabase as any)
    .from(TABLE)
    .select("*")
    .eq("objective_id", objectiveId)
    .eq("active_status", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as VocabularyEntry[];
}

/** Parent-safe vocabulary — receptive + expressive only, with parent example. */
export function toParentSafeVocabulary(entries: VocabularyEntry[]) {
  return entries.filter(
    (e) =>
      e.active_status &&
      (e.vocabulary_level === "receptive" || e.vocabulary_level === "expressive") &&
      (e.parent_example_sentence_en || e.parent_example_sentence_bm),
  );
}

/** Teacher prompt vocabulary — anything with a teacher prompt. */
export function toTeacherPromptVocabulary(entries: VocabularyEntry[]) {
  return entries.filter(
    (e) => e.active_status && (e.teacher_prompt_en || e.teacher_prompt_bm),
  );
}

/** Bilingual pairs — both EN + BM present. */
export function toBilingualPairs(entries: VocabularyEntry[]) {
  return entries.filter(
    (e) => e.active_status && e.english_word && e.bm_word,
  );
}

export function useUpsertVocabulary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: Partial<VocabularyEntry> & { age_profile_id: string }) => {
      const payload = { ...entry, updated_at: new Date().toISOString() };
      if (entry.id) {
        const { error } = await (supabase as any).from(TABLE).update(payload).eq("id", entry.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from(TABLE).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vocabulary"] }),
  });
}

export function useDeleteVocabulary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from(TABLE).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vocabulary"] }),
  });
}

export function useToggleVocabularyActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active_status }: { id: string; active_status: boolean }) => {
      const { error } = await (supabase as any)
        .from(TABLE)
        .update({ active_status, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vocabulary"] }),
  });
}

/** Readiness/coverage stats for the current age profile. */
export type VocabularyReadiness = {
  total: number;
  active: number;
  missingBm: number;
  missingEn: number;
  missingParentExample: number;
  missingTeacherPrompt: number;
  byWordType: Record<string, number>;
  byDomain: Record<string, number>;
  byTheme: Record<string, number>;
};

export function summarizeVocabulary(entries: VocabularyEntry[]): VocabularyReadiness {
  const r: VocabularyReadiness = {
    total: entries.length,
    active: 0,
    missingBm: 0,
    missingEn: 0,
    missingParentExample: 0,
    missingTeacherPrompt: 0,
    byWordType: {},
    byDomain: {},
    byTheme: {},
  };
  for (const e of entries) {
    if (e.active_status) r.active += 1;
    if (!e.bm_word) r.missingBm += 1;
    if (!e.english_word) r.missingEn += 1;
    if (!e.parent_example_sentence_en && !e.parent_example_sentence_bm) r.missingParentExample += 1;
    if (!e.teacher_prompt_en && !e.teacher_prompt_bm) r.missingTeacherPrompt += 1;
    r.byWordType[e.word_type] = (r.byWordType[e.word_type] || 0) + 1;
    if (e.domain_id) r.byDomain[e.domain_id] = (r.byDomain[e.domain_id] || 0) + 1;
    if (e.theme_id) r.byTheme[e.theme_id] = (r.byTheme[e.theme_id] || 0) + 1;
  }
  return r;
}