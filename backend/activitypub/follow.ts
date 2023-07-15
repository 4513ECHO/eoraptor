import type { Client } from "../deps.ts";
import type { Activity } from "../types/activitypub/activity.ts";
import type { Actor } from "../types/activitypub/mod.ts";
import type { ActorFollowingRow } from "../types/database.ts";

/** Add a pending following */
export async function addFollowing(
  db: Client,
  follower: Actor,
  followee: Actor,
  followeeAcct: string,
): Promise<string> {
  const { rows: [{ id }] } = await db.queryObject<ActorFollowingRow>(
    `INSERT INTO actor_following (follower_id, followee_id, followee_acct)
     VALUES ((SELECT id FROM actor WHERE uri=$1), (SELECT id FROM actor WHERE uri=$2), $3)
     ON CONFLICT DO NOTHING
     RETURNING id;`,
    [follower.id.toString(), followee.id.toString(), followeeAcct],
  );
  return id;
}

/** Accept the pending following request */
export async function acceptFollowing(
  db: Client,
  follower: Actor,
  followee: Actor,
): Promise<void> {
  await db.queryObject(
    `UPDATE actor_following SET is_accepted=true
     WHERE follower_id=$1 AND followee_id=$2 AND is_accepted=false;`,
    [follower.id.toString(), followee.id.toString()],
  );
}

export async function getFollowers(
  db: Client,
  followee: Actor,
): Promise<string[]> {
  const { rows } = await db.queryObject<ActorFollowingRow>(
    `SELECT follower_id FROM actor_following
     WHERE followee_id=$1 AND is_accepted=true`,
    [followee.id.toString()],
  );
  return rows.map((row) => row.follower_id);
}

export async function removeFollowing(
  db: Client,
  follower: Actor,
  followee: Actor,
): Promise<void> {
  await db.queryObject(
    `DELETE FROM actor_following WHERE follower_id=$1 AND followee_id=$2`,
    [follower.id.toString(), followee.id.toString()],
  );
}
