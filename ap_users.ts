import { Context, Hono } from "./deps.ts";
import { verify } from "./httpsig/mod.ts";
import type { Env } from "./main.ts";
import type { Activity } from "./types/activitypub/activity.ts";
import * as actors from "./activitypub/actor.ts";
import * as accept from "./activitypub/accept.ts";
import * as follow from "./activitypub/follow.ts";
import { parseHandle } from "./well_known.ts";

function activityJson(ctx: Context, object: unknown): Response {
  ctx.header("Content-Type", "application/activity+json");
  return ctx.body(JSON.stringify(object));
}

function getActorAsId(activity: Activity): URL {
  if (typeof activity.actor === "string" || activity.actor instanceof URL) {
    return new URL(activity.actor);
  } else if (activity.actor.id) {
    return new URL(activity.actor.id);
  }
  throw new Error(`unknown value: ${JSON.stringify(activity.actor)}`);
}
function getObjectAsId(activity: Activity): URL {
  if (typeof activity.object === "string" || activity.object instanceof URL) {
    return new URL(activity.object);
  } else if (activity.object.id) {
    return new URL(activity.object.id);
  }
  throw new Error(`unknown value: ${JSON.stringify(activity.object)}`);
}

const app = new Hono<Env>();
export default app;

app.get("/:id", async (ctx) => {
  const actor = await actors.getActorById(new URL(ctx.req.url), ctx.get("db"));
  if (!actor) {
    return ctx.notFound();
  }
  return activityJson(ctx, actor);
});

app.post("/:id/inbox", async (ctx) => {
  if (
    !ctx.req.header("Content-Type")?.startsWith("application/activity+json") ||
    !await verify(ctx.req.raw)
  ) {
    return ctx.body(null, 400);
  }

  const [db, userKEK] = [ctx.get("db"), ctx.get("userKEK")];
  const { hostname: domain, protocol } = new URL(ctx.req.url);
  const handle = parseHandle(ctx.req.param("id"));
  if (handle.domain !== null && handle.domain !== domain) {
    return ctx.body(null, 403);
  }
  const actorId = new URL(
    `${protocol}//${domain}/ap/users/${handle.localPart}`,
  );
  const actor = await actors.getActorById(actorId, db);
  if (!actor) {
    return ctx.notFound();
  }

  const activity = await ctx.req.json<Activity>();
  console.debug(Deno.inspect({ from: "inbox", type: activity.type }));
  switch (activity.type) {
    case "Follow": {
      const objectId = getObjectAsId(activity);
      const actorId = getActorAsId(activity);

      const receiver = await actors.getActorById(objectId, db);
      if (receiver !== null) {
        const originalActor = await actors.getAndCache(actorId, db);
        const receiverAcct = `${receiver.preferredUsername}@${domain}`;

        await follow.addFollowing(db, originalActor, receiver, receiverAcct);

        // Automatically send the Accept reply
        await follow.acceptFollowing(db, originalActor, receiver);
        await actors.deliverToActor(
          await actors.getSigningKey(userKEK, db, receiver),
          receiver,
          originalActor,
          accept.create(receiver, activity),
        );
      }
      break;
    }
    default:
      // Not supported
      return ctx.body(null, 400);
  }
  return ctx.body(null, 202);
});
