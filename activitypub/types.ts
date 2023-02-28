// based on https://github.com/Aoinu/activitypub-objects

export type MediaType = string;
export type LanguageTag = string;
export type Context = unknown;

export interface ActivityObject {
  "@context": Context;
  type: string;
  id: URL;
  attachment?: ActivityObject | Link;
  content?: string;
  context?: ActivityObject | Link;
  name?: string;
  generator?: ActivityObject | Link;
  icon?: Link | Image;
  location?: ActivityObject | URL | Link;
  preview?: ActivityObject | Link;
  endTime?: Date;
  startTime?: Date;
  published?: Date;
  updated?: Date;
  inReplyTo?: ActivityObject | Link;
  to?: ActivityObject | Link;
  bto?: ActivityObject | Link;
  cc?: ActivityObject | Link;
  bcc?: ActivityObject | Link;
  replies?: Collection;
  summary?: string;
  tag?: ActivityObject | Link;
  url?: URL | Link | Array<URL | Link>;
  mediaType?: MediaType;
  duration?: string;
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

interface CollectionBase extends ActivityObject {
  totalItems: number;
  current?: CollectionPage | Link;
  first?: CollectionPage | Link;
  last?: CollectionPage | Link;
}

export interface Collection extends CollectionBase {
  items: Array<ActivityObject | Link>;
}

export interface OrderedCollection extends Collection {
  orderedItems: Array<ActivityObject | Link>;
}

interface CollectionPageBase extends CollectionBase {
  partOf?: Collection | Link;
  next?: CollectionPage | Link;
  prev?: CollectionPage | Link;
}

export interface CollectionPage extends CollectionPageBase, Collection {}

export interface OrderedCollectionPage
  extends CollectionPageBase, OrderedCollection {
  startIndex: number;
}

export interface Article extends ActivityObject {
  type: "Article";
  name: string;
  content: string;
  attributedTo?: Actor | URL | Array<Actor | URL>;
}

export interface Image extends ActivityObject {
  type: "Image";
  name: string;
  url: Link | URL | Array<Link | URL>;
}

/** https://www.w3.org/TR/activitystreams-vocabulary/#actor-types */
export interface Actor extends ActivityObject {
  inbox: URL;
  outbox: URL;
  following: URL;
  followers: URL;

  alsoKnownAs?: string;
}

/** https://www.w3.org/TR/activitystreams-vocabulary/#dfn-person */
export interface Person extends Actor {
  type: "Person";
  publicKey: {
    id: string;
    owner: URL;
    publicKeyPem: string;
  };
}
