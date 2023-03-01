import { Hono, stringify } from "./deps.ts";

export interface Handle {
  localPart: string;
  domain: string | null;
}

export function parseHandle(query: string): Handle {
  if (query.startsWith("@")) {
    query = query.substring(1);
  }
  query = decodeURIComponent(query);
  const parts = query.split("@");
  const localPart = parts[0];
  if (!/^[\w-.]+$/.test(localPart)) {
    throw new Error("invalid handle: localPart: " + localPart);
  }
  if (parts.length > 1) {
    return { localPart, domain: parts[1] };
  } else {
    return { localPart, domain: null };
  }
}

export const wellKnown = new Hono();

wellKnown.get("/host-meta", (ctx) => {
  const { hostname } = new URL(ctx.req.url);
  ctx.header("Content-Type", "application/xrd+xml");
  return ctx.body(stringify({
    xml: { "@version": "1.0", "@encoding": "UTF-8" },
    XRD: {
      "@xmlns": "http://docs.oasis-open.org/ns/xri/xrd-1.0",
      Link: {
        "@rel": "lrdd",
        "@type": "application/xrd+xml",
        "@template": `http://${hostname}/.well-known/webfinger?resource={uri}`,
      },
    },
  }));
});

wellKnown.get("/nodeinfo", (ctx) => {
  const { hostname } = new URL(ctx.req.url);
  ctx.header("Cache-Control", "max-age=86400, public");
  return ctx.json({
    links: [
      {
        rel: "http://nodeinfo.diaspora.software/ns/schema/2.0",
        href: `http://${hostname}/.well-known/nodeinfo/2.0`,
      },
    ],
  });
});

wellKnown.get("/nodeinfo/2.0", (ctx) => {
  ctx.header("Cache-Control", "max-age=86400, public");
  return ctx.json({
    version: "2.0",
    software: { name: "eoraptor", version: "0.1.0" },
    protocols: ["activitypub"],
    services: { outbound: [], inbound: [] },
    usage: { users: {} },
    openRegistrations: false,
    metadata: {},
  });
});
wellKnown.get("/webfinger", (ctx) => {
  const { hostname } = new URL(ctx.req.url);
  const resource = decodeURIComponent(ctx.req.query("resource") ?? "");
  if (!resource || !resource.startsWith("acct:")) {
    return ctx.body(null, 400);
  }
  const handle = parseHandle(resource.substring("acct:".length));
  if (!handle.domain) {
    return ctx.body(null, 400);
  } else if (handle.domain !== hostname) {
    return ctx.body(null, 403);
  }

  const selfHref = `http://${handle.domain}/ap/users/${handle.localPart}`;
  const profilePageHref = `http://${handle.domain}/@${handle.localPart}`;
  const self = {
    rel: "self",
    type: "application/activity+json",
    href: selfHref,
  };
  const profilePage = {
    rel: "http://webfinger.net/rel/profile-page",
    type: "text/html",
    href: profilePageHref,
  };
  ctx.header("Cache-Control", "max-age=3600, public");
  ctx.header("Content-Type", "application/jrd+json");
  return ctx.body(JSON.stringify({
    subject: `acct:${handle.localPart}@${handle.domain}`,
    aliases: [selfHref, profilePageHref],
    links: [self, profilePage],
  }));
});
