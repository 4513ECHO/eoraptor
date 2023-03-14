import { Context, Hono } from "./deps.ts";
import { verify } from "./httpsig/mod.ts";
import type { Env } from "./main.ts";
import type { Activity } from "./types/activitypub/activity.ts";
import type { ActivityObject } from "./types/activitypub/mod.ts";
import * as actors from "./activitypub/actor.ts";
import * as accept from "./activitypub/accept.ts";
import * as follow from "./activitypub/follow.ts";
import { parseHandle } from "./well_known.ts";

function activityJson(ctx: Context, object: unknown): Response {
  ctx.header("Content-Type", "application/activity+json");
  return ctx.body(JSON.stringify(object));
}

function isValidMediaType(header?: string): boolean {
  return header !== undefined &&
    (header.includes("application/activity+json") ||
      (header.includes("application/ld+json") && header.includes("profile=")));
}

function isActivity(x: unknown): x is Activity {
  return typeof x === "object" && x !== null &&
    "type" in x && typeof x.type === "string" &&
    "id" in x && (typeof x.id === "string" || x.id instanceof URL) &&
    "actor" in x &&
    (actors.isActor(x.actor) || typeof x.actor === "string" ||
      x.actor instanceof URL) &&
    "object" in x &&
    (typeof x.object === "object" || typeof x.object === "string" ||
      x.object instanceof URL);
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
async function resolveObject(
  obj: ActivityObject | URL,
): Promise<ActivityObject> {
  if (typeof obj === "string" || obj instanceof URL) {
    return await fetch(obj).then((response) => response.json());
  }
  return obj;
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
    !isValidMediaType(ctx.req.header("Content-Type")) ||
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
    case "Undo": {
      console.debug(Deno.inspect({ from: "inbox", object: activity.object }));
      const object = await resolveObject(activity.object);
      if (!isActivity(object)) {
        return ctx.body(null, 400);
      }
      switch (object.type) {
        case "Follow": {
          const objectId = getObjectAsId(object);
          const actorId = getActorAsId(object);
          console.debug(Deno.inspect({ from: "inboxUndo", objectId, actorId }));

          const receiver = await actors.getActorById(objectId, db);
          if (receiver !== null) {
            const originalActor = await actors.getAndCache(actorId, db);
            await follow.removeFollowing(db, originalActor, receiver);
          }
          break;
        }
        default:
          // Not supported
          return ctx.body(null, 400);
      }
      break;
    }
    default:
      // Not supported
      return ctx.body(null, 400);
  }
  return ctx.body(null, 202);
});

app.get("/:id/followers", async (ctx) => {
  if (!isValidMediaType(ctx.req.header("Accept"))) {
    return ctx.body(null, 400);
  }
  const db = ctx.get("db");
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

  const followers = await follow.getFollowers(db, actor);

  return activityJson(ctx, {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: actor.followers,
    type: "OrderedCollection",
    totalItems: followers.length,
    orderedItems: followers,
  });
});
