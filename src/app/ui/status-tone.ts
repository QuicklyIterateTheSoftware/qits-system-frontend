import type { QitsBadgeTone } from '@qits/ui-components';

/**
 * What colour a status word is, in one place, for every badge on every page.
 *
 * `QitsBadge` takes a *semantic* tone and never a colour, so this file is a translation between two
 * vocabularies rather than styling. Several docker enums share it — a node's status and
 * availability, a container's state, a task's current and desired state, the swarm's own state —
 * because they overlap and never collide.
 *
 * **The lookup is case-insensitive**, and that is not tidiness. Docker spells the same idea in two
 * cases depending on which command answered: `docker node ls` says `Ready`, `docker ps` says
 * `running`, and a task's desired state is `Running`. One map, keyed in upper case, is what stops
 * the same word rendering grey on one page and green on the next.
 *
 * **PAUSE and DRAIN are warnings, not failures.** An operator put the node there deliberately; the
 * badge says "this node is not taking work", which is exactly what the reader needs to see before
 * asking why a service has fewer replicas than it wants.
 */
const TONES: Readonly<Record<string, QitsBadgeTone>> = {
  // A swarm node: its status, then its availability.
  READY: 'success',
  DOWN: 'danger',
  DISCONNECTED: 'danger',
  UNKNOWN: 'neutral',
  ACTIVE: 'success',
  PAUSE: 'warning',
  DRAIN: 'warning',
  // The daemon's own swarm state (`docker info`).
  INACTIVE: 'neutral',
  PENDING: 'warning',
  LOCKED: 'warning',
  ERROR: 'danger',
  // A container.
  RUNNING: 'success',
  CREATED: 'info',
  RESTARTING: 'warning',
  PAUSED: 'warning',
  REMOVING: 'warning',
  EXITED: 'neutral',
  DEAD: 'danger',
  // A swarm task, current or desired.
  NEW: 'info',
  ALLOCATED: 'info',
  ASSIGNED: 'info',
  ACCEPTED: 'info',
  PREPARING: 'warning',
  STARTING: 'warning',
  COMPLETE: 'success',
  SHUTDOWN: 'neutral',
  FAILED: 'danger',
  REJECTED: 'danger',
  ORPHANED: 'danger',
  REMOVE: 'neutral',
  // A target's connection and quarantine (epic qits-1481). DISCONNECTED already reads `danger`,
  // above, and means the same thing for a target that holds no live socket as it does for a node
  // nothing can reach.
  CONNECTED: 'success',
  QUARANTINED: 'danger',
  // A harness's sign-in state (`TargetLogin.claude`/`.kimi`) and a settled health check's verdict.
  PRESENT: 'success',
  ABSENT: 'danger',
  PASSED: 'success',
  // A target sign-in's state (qits-1593). STARTING and FAILED already carry a task's tones above.
  AWAITING_CODE: 'info',
  AWAITING_BROWSER: 'info',
  SUCCEEDED: 'success',
  EXPIRED: 'warning',
  CANCELLED: 'neutral',
  // A lease's state. RUNNING, EXITED and FAILED already carry a container's tones above, and mean
  // the same thing here.
  QUEUED: 'warning',
  GRANTED: 'info',
  ENDING: 'warning',
  ENDED: 'neutral',
};

/**
 * The tone for a status word.
 *
 * `neutral` for a status this build has not been taught: docker grows enum values without asking,
 * and a new one must render as a plain grey badge rather than crash a table or silently claim
 * success. A missing word is the same answer, and it is taken seriously here because the alternative
 * is a whole page thrown away by one field a service has not sent yet.
 */
export function toneOf(status: string | null | undefined): QitsBadgeTone {
  return status ? (TONES[status.trim().toUpperCase()] ?? 'neutral') : 'neutral';
}
