/**
 * Assessment state machine — enforces valid status transitions.
 *
 * Valid transitions:
 *   in_progress -> scoring      (completion starts)
 *   in_progress -> abandoned    (user quits)
 *   scoring     -> completed    (scoring succeeds or falls back)
 *   scoring     -> in_progress  (outer catch resets on unexpected error)
 */

import type { Assessment } from "@shared/schema";

const VALID_TRANSITIONS: Record<string, string[]> = {
  in_progress: ["scoring", "completed", "abandoned"],
  scoring: ["completed", "in_progress"],
  completed: ["in_progress"],
  abandoned: ["in_progress"],  // admin re-score recovery
};

export function validateTransition(current: string, next: string): boolean {
  const allowed = VALID_TRANSITIONS[current];
  return !!allowed && allowed.includes(next);
}

/**
 * Validates the transition, then delegates to storage.updateAssessment.
 * Logs and throws on invalid transitions so callers can handle gracefully.
 */
export async function transitionAssessment(
  storage: { updateAssessment(id: number, data: Partial<Assessment>): Promise<Assessment | undefined> },
  assessmentId: number,
  currentStatus: string,
  nextStatus: string,
  updates: Partial<Assessment> = {},
): Promise<Assessment | undefined> {
  if (!validateTransition(currentStatus, nextStatus)) {
    console.error(
      `Invalid assessment state transition: "${currentStatus}" -> "${nextStatus}" (assessment ${assessmentId})`,
    );
    throw new Error(`Invalid state transition: ${currentStatus} -> ${nextStatus}`);
  }

  return storage.updateAssessment(assessmentId, {
    ...updates,
    status: nextStatus,
  });
}
