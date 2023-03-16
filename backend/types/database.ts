import type { Image, Link } from "./activitypub/mod.ts";

export interface ActorsRow {
  id: string;
  type: string;
  privkey: Uint8Array | null;
  privkey_salt: Uint8Array | null;
  pubkey: string | null;
  created_at: Date;
  properties: {
    icon?: Link | Image;
    name?: string;
    preferredUsername?: string;
    summary?: string;
  };
  is_admin: boolean;
}

export interface ActorFollowingRow {
  id: string;
  actor_id: string;
  target_actor_id: string;
  target_actor_acct: string;
  is_accepted: boolean;
  created_at: Date;
}
