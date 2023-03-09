import type { Actor } from "../types/activitypub/mod.ts";
import type { ActorsRow } from "../types/database.ts";
import type { Client } from "../deps.ts";
import { unwrapPrivateKey } from "../key.ts";
import { Activity } from "../types/activitypub/activity.ts";
import { sign } from "../httpsig/mod.ts";

export function isActor(x: unknown): x is Actor {
  if (x === null || typeof x !== "object") {
    return false;
  }
  const obj = x as Record<string, unknown>;
  return typeof obj.type === "string" &&
    (typeof obj.id === "string" || obj.id instanceof URL) &&
    (typeof obj.inbox === "string" || obj.inbox instanceof URL);
}

export async function getActorById(id: URL, db: Client): Promise<Actor | null> {
  const { rows: [result] } = await db.queryObject<ActorsRow>(
    "SELECT * from actors WHERE id=$1",
    [id.toString()],
  );
  if (!result) {
    return null;
  }
  const { name, preferredUsername, summary, icon } = result.properties;
  const publicKey = result.pubkey === null ? null : {
    id: `${result.id}#main-key`,
    owner: result.id,
    publicKeyPem: result.pubkey,
  };
  return Promise.resolve({
    "@context": [
      "https://www.w3.org/ns/activitystreams",
      "https://w3id.org/security/v1",
      {
        toot: "https://joinmastodon.org/ns#",
        discoverable: "toot:discoverable",
      },
    ],
    type: "Person",
    id,
    discoverable: true,
    inbox: new URL(id.toString() + "/inbox"),
    outbox: new URL(id.toString() + "/outbox"),
    following: new URL(id.toString() + "/following"),
    followers: new URL(id.toString() + "/followers"),
    url: new URL(`${id.protocol}//${id.hostname}/@${preferredUsername}`),
    published: new Date(result.created_at),
    name,
    preferredUsername,
    summary,
    icon,
    publicKey,
  });
}

export async function get(url: string | URL): Promise<Actor> {
  const response = await fetch(url, {
    headers: { Accept: "application/activity+json" },
  });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  const actor: Actor = await response.json();
  actor.id = new URL(actor.id);

  actor.inbox = new URL(actor.inbox);
  actor.following = new URL(actor.following);
  actor.followers = new URL(actor.followers);
  actor.outbox = new URL(actor.outbox);

  return actor;
}

export async function getAndCache(url: URL, db: Client): Promise<Actor> {
  {
    const actor = await getActorById(url, db);
    if (actor !== null) {
      return actor;
    }
  }

  const actor = await get(url);
  const properties = actor;
  await db.queryObject(
    `INSERT INTO actors (id, type, properties) VALUES ($1, $2, $3)`,
    [actor.id.toString(), actor.type, properties],
  );

  return actor;
}

export async function getSigningKey(
  instanceKey: string,
  db: Client,
  actor: Actor,
): Promise<CryptoKey> {
  const { rows: [{ privkey, privkey_salt }] } = await db.queryObject<ActorsRow>(
    `SELECT privkey, privkey_salt FROM actors WHERE id=$1`,
    [actor.id.toString()],
  );
  if (!privkey || !privkey_salt) {
    throw new Error(`Actor doesn't have privkey: ${actor.id.toString()}`);
  }
  return unwrapPrivateKey(instanceKey, privkey, privkey_salt);
}

export async function deliverToActor(
  signingKey: CryptoKey,
  from: Actor,
  to: Actor,
  activity: Activity,
) {
  console.debug(Deno.inspect({
    _from: "deliverToActor",
    signingKey,
    from: from.id.toString(),
    to: to.id.toString(),
    activity,
  }));
  const request = await sign(
    new Request(to.inbox, {
      method: "POST",
      body: JSON.stringify(activity),
      headers: {
        Accept:
          'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
        "User-Agent": "Eoraptor/0.1.0 (+https://github.com/4513ECHO/eoraptor)",
      },
    }),
    {
      privateKey: signingKey,
      keyId: `${from.id}#main-key`,
    },
  );
  console.debug(Deno.inspect({ from: "deliverToActor", request }));

  const response = await fetch(request);
  console.debug(Deno.inspect({ from: "deliverToActor", response }));
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `delivery to ${to.inbox} returned ${response.status}: ${body}`,
    );
  }
}
