import { Hono, stringify } from "./deps.ts";
import type { Env } from "./main.ts";

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

const app = new Hono<Env>();
export default app;

app.get("/host-meta", (ctx) => {
  const { hostname, protocol } = new URL(ctx.req.url);
  ctx.header("Content-Type", "application/xrd+xml");
  return ctx.body(stringify({
    xml: { "@version": "1.0", "@encoding": "UTF-8" },
    XRD: {
      "@xmlns": "https://docs.oasis-open.org/ns/xri/xrd-1.0",
      Link: {
        "@rel": "lrdd",
        "@type": "application/xrd+xml",
        "@template":
          `${protocol}//${hostname}/.well-known/webfinger?resource={uri}`,
      },
    },
  }));
});

app.get("/nodeinfo", (ctx) => {
  const { hostname, protocol } = new URL(ctx.req.url);
  ctx.header("Cache-Control", "max-age=86400, public");
  return ctx.json({
    links: [
      {
        rel: "https://nodeinfo.diaspora.software/ns/schema/2.0",
        href: `${protocol}//${hostname}/.well-known/nodeinfo/2.0`,
      },
      {
        rel: "https://nodeinfo.diaspora.software/ns/schema/2.1",
        href: `${protocol}//${hostname}/.well-known/nodeinfo/2.1`,
      },
    ],
  });
});

app.get("/nodeinfo/:version{[\\d.]+}", (ctx) => {
  ctx.header("Cache-Control", "max-age=86400, public");
  const nodeinfo = {
    version: ctx.req.param("version"),
    software: {
      name: "eoraptor",
      version: "0.1.0",
      repository: undefined as string | undefined,
    },
    protocols: ["activitypub"],
    services: { outbound: [], inbound: [] },
    usage: { users: {} },
    openRegistrations: false,
    metadata: {},
  };
  switch (ctx.req.param("version")) {
    case "2.0":
      return ctx.json(nodeinfo);
    case "2.1":
      nodeinfo.software.repository = "https://github.com/4513ECHO/eoraptor";
      return ctx.json(nodeinfo);
    default:
      return ctx.body(null, 404);
  }
});

app.get("/webfinger", (ctx) => {
  const { hostname, protocol } = new URL(ctx.req.url);
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

  const selfHref = `${protocol}//${handle.domain}/ap/users/${handle.localPart}`;
  const profilePageHref = `${protocol}//${handle.domain}/@${handle.localPart}`;
  const self = {
    rel: "self",
    type: "application/activity+json",
    href: selfHref,
  };
  const profilePage = {
    rel: "https://webfinger.net/rel/profile-page",
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
