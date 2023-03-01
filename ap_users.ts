import { type Client, Context, Hono } from "./deps.ts";
import type { ActorsRow, Env } from "./main.ts";
import type { Actor } from "./activitypub/types.ts";

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

app.get("/:userName", async (ctx) => {
  const person = await getActorById(new URL(ctx.req.url), ctx.get("db"));
  if (!person) {
    return ctx.notFound();
  }
  return activityJson(ctx, person);
});

app.get("/:userName/inbox", (ctx) => ctx.body(null, 405));
app.post("/:userName/inbox", (ctx) => {
  return ctx.body(null, 500);
});
