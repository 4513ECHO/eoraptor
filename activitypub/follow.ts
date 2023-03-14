import type { Client } from "../deps.ts";
import type { Actor } from "../types/activitypub/mod.ts";
import type { ActorFollowingRow } from "../types/database.ts";

/** Add a pending following */
export async function addFollowing(
  db: Client,
  actor: Actor,
  target: Actor,
  targetAcct: string,
): Promise<string> {
  const { rows: [{ id }] } = await db.queryObject<ActorFollowingRow>(
    `INSERT INTO actor_following (actor_id, target_actor_id, target_actor_acct)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING
     RETURNING id;`,
    [actor.id.toString(), target.id.toString(), targetAcct],
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
    `UPDATE actor_following SET is_accepted=true
     WHERE actor_id=$1 AND target_actor_id=$2 AND is_accepted=false;`,
    [actor.id.toString(), target.id.toString()],
  );
}

export async function getFollowers(
  db: Client,
  actor: Actor,
): Promise<string[]> {
  const { rows } = await db.queryObject<ActorFollowingRow>(
    `SELECT actor_id FROM actor_following
     WHERE target_actor_id=$1 AND is_accepted=true`,
    [actor.id.toString()],
  );
  return rows.map((row) => row.actor_id);
}

export async function removeFollowing(
  db: Client,
  actor: Actor,
  target: Actor,
): Promise<void> {
  console.debug(Deno.inspect({
    from: "removeFollowing",
    actor: actor.id.toString(),
    target: target.id.toString(),
  }));
  await db.queryObject(
    `DELETE FROM actor_following WHERE actor_id=$1 AND target_actor_id=$2`,
    [actor.id.toString(), target.id.toString()],
  );
}
