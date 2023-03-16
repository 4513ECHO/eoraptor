import type { ActivityObject, Actor } from "../types/activitypub/mod.ts";
import type { Activity } from "../types/activitypub/activity.ts";

export function create(actor: Actor, object: ActivityObject): Activity {
  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    type: "Accept",
    actor: actor.id,
    object,
  };
}
