import { Context, Hono, logger, serve } from "./deps.ts";
import DATA from "./data.json" assert { type: "json" };
import type { Actor } from "./activitypub/types.ts";
import { wellKnown } from "./well_known.ts";

function activityJson(ctx: Context, object: unknown): Response {
  ctx.header("Content-Type", "application/activity+json");
  return ctx.body(JSON.stringify(object));
}

function getActorById(id: URL): Promise<Actor | null> {
  const result = DATA.actors.filter((value) => value.id === id.toString());
  if (result.length === 0) {
    return Promise.resolve(null);
  }
  const prop = JSON.parse(result[0].properties);
  const { name, preferredUsername, summary, icon } = prop;
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
    url: new URL(`https://${id.hostname}/@${prop.preferredUsername}`),
    published: new Date(result[0].created_at),
    name,
    preferredUsername,
    summary,
    icon,
  });
}

const app = new Hono();
app.use("*", logger());
app.route("/.well-known", wellKnown);

app.get("/ap/users/:userName", async (ctx) => {
  const person = await getActorById(new URL(ctx.req.url));
  if (!person) {
    return ctx.notFound();
  }
  return activityJson(ctx, person);
});

app.get("/:root{@[\\w-.]+}", (ctx) => {
  return ctx.html(`<h1>${ctx.req.param().root}</h1>`);
});

serve(app.fetch);
