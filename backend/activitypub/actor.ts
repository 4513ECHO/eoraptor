import type { Actor } from "../types/activitypub/mod.ts";
import type { ActorsRow } from "../types/database.ts";
import type { Client } from "../deps.ts";
import { unwrapPrivateKey } from "../key.ts";
import { Activity } from "../types/activitypub/activity.ts";
import { sign } from "../httpsig/mod.ts";

export function isActor(x: unknown): x is Actor {
  return typeof x === "object" && x !== null &&
    "type" in x && typeof x.type === "string" &&
    "id" in x && (typeof x.id === "string" || x.id instanceof URL) &&
    "inbox" in x && (typeof x.inbox === "string" || x.inbox instanceof URL);
}

export async function getActorByUri(
  uri: URL,
  db: Client,
): Promise<Actor | null> {
  const { rows: [result] } = await db.queryObject<ActorsRow>(
    "SELECT * FROM actors WHERE uri=$1",
    [uri.toString()],
  );
  if (!result) {
    return null;
  }
  const { name, preferredUsername, summary, icon } = result.properties;
  const publicKey = result.pubkey === null ? null : {
    id: `${result.uri}#main-key`,
    owner: result.uri,
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
    id: uri,
    discoverable: true,
    inbox: new URL(uri.toString() + "/inbox"),
    outbox: new URL(uri.toString() + "/outbox"),
    following: new URL(uri.toString() + "/following"),
    followers: new URL(uri.toString() + "/followers"),
    url: new URL(`${uri.protocol}//${uri.hostname}/@${preferredUsername}`),
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
    const actor = await getActorByUri(url, db);
    if (actor !== null) {
      return actor;
    }
  }

  const actor = await get(url);
  const properties = actor;
  await db.queryObject(
    `INSERT INTO actors (uri, type, properties) VALUES ($1, $2, $3)`,
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
    `SELECT privkey, privkey_salt FROM actors WHERE uri=$1`,
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
  const request = await sign(
    new Request(to.inbox, {
      method: "POST",
      body: JSON.stringify(activity),
      headers: {
        "Content-Type": "application/activity+json",
        "User-Agent": "Eoraptor/0.1.0 (+https://github.com/4513ECHO/eoraptor)",
      },
    }),
    {
      privateKey: signingKey,
      keyId: `${from.id}#main-key`,
    },
  );

  const response = await fetch(request);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `delivery to ${to.inbox} returned ${response.status}: ${body}`,
    );
  }
}
