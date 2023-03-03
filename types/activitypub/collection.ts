import type { ActivityObject, Link } from "./mod.ts";

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
