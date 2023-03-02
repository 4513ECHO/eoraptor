import { type Client, Context, Hono } from "./deps.ts";
import type { ActorsRow, Env } from "./main.ts";
import type { ActivityObject, Actor } from "./activitypub/types.ts";

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
  const _activity = await ctx.req.json<ActivityObject>();

  const actor = await getActorById(new URL(ctx.req.url), ctx.get("db"));
  if (!actor) {
    return ctx.notFound();
  }
  return ctx.body(null, 500);
});
