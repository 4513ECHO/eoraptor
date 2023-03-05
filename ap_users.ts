import { Context, Hono } from "./deps.ts";
import { verify } from "./httpsig/mod.ts";
import type { Env } from "./main.ts";
import type { Activity } from "./types/activitypub/activity.ts";
import * as actors from "./activitypub/actor.ts";
import * as accept from "./activitypub/accept.ts";
import * as follow from "./activitypub/follow.ts";

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
  console.log(Deno.inspect({
    from: "inbox",
    headers: ctx.req.header(),
    body: await ctx.req.raw.clone().json(),
  }));
  if (
    !ctx.req.header("Content-Type")?.startsWith("application/activity+json") ||
    !await verify(ctx.req.raw)
  ) {
    console.log(Deno.inspect({
      from: "inbox",
      verify: await verify(ctx.req.raw),
    }));
    return ctx.body(null, 400);
  }
  const [db, userKEK] = [ctx.get("db"), ctx.get("userKEK")];
  const activity = await ctx.req.json<Activity>();
  const actor = await actors.getActorById(new URL(ctx.req.url), db);
  console.log(Deno.inspect({
    from: "inbox",
    activity,
    actor,
  }));
  if (!actor) {
    return ctx.notFound();
  } else if (actor.id !== getActorAsId(activity)) {
    return ctx.body(null, 400);
  }
  switch (activity.type) {
    case "Follow": {
      const objectId = getObjectAsId(activity);
      const actorId = getActorAsId(activity);

      const receiver = await actors.getActorById(objectId, db);
      if (receiver !== null) {
        const originalActor = await actors.getAndCache(actorId, db);
        const receiverAcct = [
          receiver.preferredUsername,
          new URL(ctx.req.url).hostname,
        ].join("@");

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
