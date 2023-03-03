import type { Collection } from "./collection.ts";
// based on https://github.com/Aoinu/activitypub-objects

export type MediaType = string;
export type LanguageTag = string;
export type Context =
  | string
  | Record<string, string>
  | Array<string | Record<string, string>>;

export interface ActivityObject {
  "@context": Context;
  type: string;
  id: URL;
  attachment?: Array<ActivityObject | Link>;
  content?: string;
  context?: ActivityObject | Link;
  name?: string | null;
  generator?: ActivityObject | Link;
  icon?: Link | Image;
  location?: ActivityObject | URL | Link;
  preview?: ActivityObject | Link;
  endTime?: Date;
  startTime?: Date;
  published?: Date;
  updated?: Date;
  inReplyTo?: ActivityObject | Link;
  to?: Array<ActivityObject | Link>;
  bto?: Array<ActivityObject | Link>;
  cc?: Array<ActivityObject | Link>;
  bcc?: Array<ActivityObject | Link>;
  replies?: Collection;
  summary?: string;
  tag?: Array<ActivityObject | Link>;
  url?: URL | Link | Array<URL | Link>;
  mediaType?: MediaType;
  duration?: string;

  sensitive?: boolean;
}

export interface Link {
  "@context": Context;
  type: string;
  href: URL;
  rel?: string;
  mediaType?: MediaType;
  name?: string;
  hreflang?: LanguageTag;
  height?: number;
  width?: number;
  preview?: Link | ActivityObject;
}

export interface Article extends ActivityObject {
  type: "Article";
  name: string;
  content: string;
  attributedTo?: Actor | URL | Array<Actor | URL>;
}

export interface Image extends ActivityObject {
  type: "Image";
  name: string | null;
  url: Link | URL | Array<Link | URL>;
}

/** https://www.w3.org/TR/activitystreams-vocabulary/#actor-types */
export interface Actor extends ActivityObject {
  inbox: URL;
  outbox: URL;
  following: URL;
  followers: URL;
  preferredUsername?: string;

  alsoKnownAs?: string;
  discoverable?: boolean;
}

/** https://www.w3.org/TR/activitystreams-vocabulary/#dfn-person */
export interface Person extends Actor {
  type: "Person";
  publicKey?: Key;
}

export interface Key extends ActivityObject {
  type: "Key";
  id: URL;
  owner: URL;
  publicKeyPem?: string;
}
