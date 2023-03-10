import type { Client } from "../deps.ts";
import type { Actor } from "../types/activitypub/mod.ts";
import type { ActorFollowingRow } from "../types/database.ts";

enum State {
  PENDING = "pending",
  ACCEPTED = "accepted",
}

/** Add a pending following */
export async function addFollowing(
  db: Client,
  actor: Actor,
  target: Actor,
  targetAcct: string,
): Promise<string> {
  const id = crypto.randomUUID();
  await db.queryObject(
    `INSERT INTO actor_following (id, actor_id, target_actor_id, state, target_actor_acct)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING;`,
    [id, actor.id.toString(), target.id.toString(), State.PENDING, targetAcct],
  );
  return id;
}

/** Accept the pending following request */
export async function acceptFollowing(
  db: Client,
  actor: Actor,
  target: Actor,
): Promise<void> {
  await db.queryObject(
    `UPDATE actor_following SET state=$1
     WHERE actor_id=$2 AND target_actor_id=$3 AND state=$4;`,
    [State.ACCEPTED, actor.id.toString(), target.id.toString(), State.PENDING],
  );
}

export async function getFollowers(
  db: Client,
  actor: Actor,
): Promise<string[]> {
  const { rows } = await db.queryObject<ActorFollowingRow>(
    `SELECT actor_id FROM actor_following WHERE target_actor_id=$1 AND state=$2`,
    [actor.id.toString(), State.ACCEPTED],
  );
  return rows.map((row) => row.actor_id);
}
