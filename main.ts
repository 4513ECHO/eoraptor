import { type Context, Hono } from "https://deno.land/x/hono@v3.0.2/mod.ts";
import { logger } from "https://deno.land/x/hono@v3.0.2/middleware.ts";
import { stringify } from "https://deno.land/x/xml@2.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.178.0/http/server.ts";
// import { zValidator } from "https://esm.sh/@hono/zod-validator@0.0.6";
// import { z } from "https://deno.land/x/zod@v3.20.5/mod.ts";
// import { DB } from "https://deno.land/x/sqlite@v3.7.0/mod.ts";
import DATA from "./data.json" assert { type: "json" };
import type { Actor } from "./activitypub/types.ts";

interface Handle {
  localPart: string;
  domain: string | null;
}

function parseHandle(query: string): Handle {
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

function activityJson(ctx: Context, object: unknown): Response {
  // ctx.header("Content-Type", "application/activity+json; charset=UTF-8");
  ctx.header("Content-Type", "application/activity+json");
  return ctx.body(JSON.stringify(object));
}

const wellKnown = new Hono();

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
  ctx.header("Cache-Control", "max-age=259200, public");
  return ctx.json({
    links: [
      {
        rel: "http://nodeinfo.diaspora.software/ns/schema/2.0",
        href: `http://${hostname}/nodeinfo/2.0`,
      },
    ],
  });
});
wellKnown.get("/nodeinfo/2.0", (ctx) => {
  ctx.header("Cache-Control", "max-age=259200, public");
  return ctx.json({
    version: "2.0",
    software: { name: "eorapof", version: "0.1.0" },
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
  ctx.header("Cache-Control", "public, max-age=3600");
  return activityJson(ctx, {
    subject: `acct:${handle.localPart}@${handle.domain}`,
    aliases: [selfHref, profilePageHref],
    links: [self, profilePage],
  });
});

function getActorById(id: URL): Promise<Actor | null> {
  const result = DATA.actors.filter((value) => value.id === id.toString());
  if (result.length === 0) {
    return Promise.resolve(null);
  }
  const prop = JSON.parse(result[0].properties);
  const { name, preferredUsername, summary, icon } = prop;
  return Promise.resolve({
    "@context": [
      "https://www.w3.org/ns/activitystreams",
      "https://w3id.org/security/v1",
      {
        toot: "http://joinmastodon.org/ns#",
        discoverable: "toot:discoverable",
      },
    ],
    type: "Person",
    id,
    discoverable: true,
    inbox: new URL(id.toString() + "/indox"),
    outbox: new URL(id.toString() + "/outbox"),
    following: new URL(id.toString() + "/following"),
    followers: new URL(id.toString() + "/followers"),
    url: new URL(`https://${id.hostname}/@${prop.preferredUsername}`),
    published: new Date(result[0].created_at),
    name,
    preferredUsername,
    summary,
    icon,
  });
}

const app = new Hono();
app.use("*", logger());
app.route("/.well-known", wellKnown);
app.get("/ap/users/:userName", async (ctx) => {
  const person = await getActorById(new URL(ctx.req.url));
  if (!person) {
    return ctx.notFound();
  }
  return activityJson(ctx, person);
});
app.get("/:root{@[\\w-.]+}", (ctx) => {
  return ctx.html(`<h1>${ctx.req.param().root}</h1>`);
});

serve(app.fetch);
