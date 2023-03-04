import { type Client, Context, Hono } from "./deps.ts";
import type { ActorsRow, Env } from "./main.ts";
import type { Activity } from "./types/activitypub/activity.ts";
import type { Actor } from "./types/activitypub/mod.ts";

function activityJson(ctx: Context, object: unknown): Response {
  ctx.header("Content-Type", "application/activity+json");
  return ctx.body(JSON.stringify(object));
}

async function getActorById(id: URL, db: Client): Promise<Actor | null> {
  const { rows } = await db.queryObject<ActorsRow>(
    "SELECT * from actors WHERE id=$1",
    [id.toString()],
  );
  if (rows.length === 0) {
    return Promise.resolve(null);
  }
  const { name, preferredUsername, summary, icon } = rows[0].properties;
  return Promise.resolve({
    "@context": [
      "https://www.w3.org/ns/activitystreams",
      "https://w3id.org/security/v1",
      {
        toot: "http://joinmastodon.org/ns#",
        discoverable: "toot:discoverable",
      },
    ],
    type: "Person",
    id,
    discoverable: true,
    inbox: new URL(id.toString() + "/indox"),
    outbox: new URL(id.toString() + "/outbox"),
    following: new URL(id.toString() + "/following"),
    followers: new URL(id.toString() + "/followers"),
    url: new URL(`https://${id.hostname}/@${preferredUsername}`),
    published: new Date(rows[0].created_at),
    name,
    preferredUsername,
    summary,
    icon,
  });
}

function isActor(x: unknown): x is Actor {
  if (!(x && typeof x === "object")) {
    return false;
  }
  const obj = x as Record<string, unknown>;
  return !!obj.type && typeof obj.type === "string" &&
    !!obj.id && (typeof obj.id === "string" || obj.id instanceof URL) &&
    !!obj.inbox && (typeof obj.inbox === "string" || obj.inbox instanceof URL);
}

async function fetchActor(activity: Activity): Promise<Actor> {
  if (isActor(activity.actor)) {
    return activity.actor;
  }
  const response = await fetch(activity.actor, {
    headers: { Accept: "application/activity+json" },
  });
  return await response.json();
}

const app = new Hono<Env>();
export default app;

app.get("/:id", async (ctx) => {
  const actor = await getActorById(new URL(ctx.req.url), ctx.get("db"));
  if (!actor) {
    return ctx.notFound();
  }
  return activityJson(ctx, actor);
});

app.post("/:id/inbox", async (ctx) => {
  if (
    !ctx.req.header("Content-Type")?.startsWith("application/activity+json")
  ) {
    return ctx.body(null, 400);
  }
  const activity = await ctx.req.json<Activity>();
  const actor = await getActorById(new URL(ctx.req.url), ctx.get("db"));
  if (!actor) {
    return ctx.notFound();
  } else if (actor.id !== (await fetchActor(activity)).id) {
    return ctx.body(null, 400);
  }
  switch (activity.type) {
    case "Follow":
    case "Announce":
    case "Like":
      // Not supported
      return ctx.body(null);
  }
  return ctx.body(null);
});
