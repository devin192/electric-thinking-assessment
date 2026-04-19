// ---------------------------------------------------------------------------
// Cross-user nudge similarity detection
//
// Prevents the same insight from being generated for multiple users in the same
// week. If 5 BraceAbility learners all get "prompts are like meeting briefs"
// within a few days, comparing notes would break the personalized feel.
//
// Heuristic (intentionally simple, no embeddings):
//   - Word-overlap on subjectLine       > 50%  -> similar
//   - Word-overlap on first sentence of
//     universalInsight                  > 70%  -> similar
//
// If EITHER signal trips, the nudge is flagged as similar. The caller can then
// regenerate with a "do not repeat this" instruction.
// ---------------------------------------------------------------------------
import type { Nudge } from "@shared/schema";

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------
export const SUBJECT_SIMILARITY_THRESHOLD = 0.5; // >50% word overlap
export const INSIGHT_SIMILARITY_THRESHOLD = 0.7; // >70% word overlap on first sentence
export const MAX_REGENERATION_ATTEMPTS = 2;

// ---------------------------------------------------------------------------
// Tokenization
// ---------------------------------------------------------------------------
// Very common words that tell us nothing about the nudge's content. Without a
// stopword filter, two short subjects like "The one-shot trap" and "The 4-round
// rule" would share "the" and look artificially close.
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for",
  "from", "has", "have", "he", "i", "in", "is", "it", "its", "not",
  "of", "on", "or", "that", "the", "this", "to", "was", "were", "will",
  "with", "you", "your", "my", "me", "we", "us", "our", "they", "them",
  "their", "do", "does", "did", "can", "could", "would", "should", "just",
  "so", "if", "then", "than", "there", "here", "into", "about", "over",
  "under", "up", "down", "out", "off", "re",
]);

/**
 * Split text into lowercased content tokens. Strips punctuation, filters
 * stopwords and tokens of length < 2. Deliberately forgiving (no stemming).
 * Catching "meeting" vs "meetings" exactly isn't worth the dependency.
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s'-]/g, " ")      // punctuation -> space
    .replace(/'s\b/g, "")             // possessives
    .split(/\s+/)
    .filter(t => t.length >= 2 && !STOP_WORDS.has(t));
}

/**
 * Jaccard-style word overlap, but asymmetric to favour the shorter of two
 * strings: returns (shared tokens) / min(tokens in a, tokens in b). This is
 * more sensitive when one nudge is a near-subset of another. Returns 0 for
 * empty inputs so callers don't divide by zero.
 */
export function wordOverlap(a: string, b: string): number {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let shared = 0;
  tokensA.forEach(tok => {
    if (tokensB.has(tok)) shared++;
  });
  return shared / Math.min(tokensA.size, tokensB.size);
}

/**
 * Grab the first sentence from a block of text. Falls back to the whole string
 * if no terminator is found, so very short insights still get compared.
 */
export function firstSentence(text: string): string {
  if (!text) return "";
  const match = text.match(/^[^.!?]*[.!?]/);
  return match ? match[0].trim() : text.trim();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export interface SimilarityCandidate {
  subjectLine: string;
  universalInsight: string;
}

export interface SimilarityMatch {
  nudgeId: number;
  userId: number;
  subjectLine: string;
  universalInsight: string;
  subjectOverlap: number;
  insightOverlap: number;
  reason: "subject" | "insight" | "both";
}

/**
 * Extract the comparable text fields from a stored Nudge row.
 * Handles both new (universalInsight) and legacy (opener/idea) shapes.
 */
function extractNudgeText(nudge: Nudge): SimilarityCandidate {
  const c = (nudge.contentJson as any) || {};
  const insight: string = c.universalInsight || c.opener || c.idea || "";
  const subject: string = c.subjectLine || nudge.subjectLine || "";
  return { subjectLine: subject, universalInsight: insight };
}

/**
 * Scan recent nudges from other users. Returns the FIRST match found (we don't
 * need the strongest; one collision is enough to trigger a regeneration).
 * Callers should pre-filter `recentNudges` to exclude the current user.
 */
export function findSimilarNudge(
  candidate: SimilarityCandidate,
  recentNudges: Nudge[],
): SimilarityMatch | null {
  const candidateFirstSentence = firstSentence(candidate.universalInsight);

  for (const existing of recentNudges) {
    const existingText = extractNudgeText(existing);
    if (!existingText.subjectLine && !existingText.universalInsight) continue;

    const subjectOverlap = wordOverlap(candidate.subjectLine, existingText.subjectLine);
    const insightOverlap = wordOverlap(
      candidateFirstSentence,
      firstSentence(existingText.universalInsight),
    );

    const subjectHit = subjectOverlap > SUBJECT_SIMILARITY_THRESHOLD;
    const insightHit = insightOverlap > INSIGHT_SIMILARITY_THRESHOLD;

    if (subjectHit || insightHit) {
      return {
        nudgeId: existing.id,
        userId: existing.userId,
        subjectLine: existingText.subjectLine,
        universalInsight: existingText.universalInsight,
        subjectOverlap,
        insightOverlap,
        reason: subjectHit && insightHit ? "both" : subjectHit ? "subject" : "insight",
      };
    }
  }

  return null;
}

/**
 * Build the anti-duplication instruction injected into the prompt on retry.
 * Kept separate so the prompt-builder can decide where to place it.
 */
export function buildAvoidInstruction(match: SimilarityMatch): string {
  return `CRITICAL: A similar nudge was recently sent to another user in this cohort. Make yours MEANINGFULLY DIFFERENT. Different topic, different angle, different action, different subject line.

Do NOT produce something like this:
  Subject: "${match.subjectLine}"
  Insight: "${match.universalInsight}"

Pick a different angle entirely.`;
}
