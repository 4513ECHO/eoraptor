import type { ActivityObject, Actor, Link } from "./mod.ts";

export interface Activity extends ActivityObject {
  actor: Actor | URL;
  object: ActivityObject | URL;
  target?: ActivityObject | URL | Link | Array<ActivityObject | URL>;
}

export interface Like extends Activity {
  type: "Like";
  _misskey_reaction?: URL;
}
