import { Client, Hono, load, logger, serve } from "./deps.ts";
import wellKnown from "./well_known.ts";
import apUsers from "./ap_users.ts";

await load({ export: true, restrictEnvAccessTo: ["POSTGRES_URL", "USER_KEK"] });

export interface Env {
  Variables: { db: Client; userKEK: string };
}

const userKEK = Deno.env.get("USER_KEK") ?? crypto.randomUUID();
const client = new Client(Deno.env.get("POSTGRES_URL"));
await client.connect();

const app = new Hono<Env>();
app.use("*", logger());
app.use("*", async (ctx, next) => {
  ctx.set("db", client);
  ctx.set("userKEK", userKEK);
  await next();
});
app.route("/.well-known", wellKnown);
app.route("/ap/users", apUsers);

app.get("/:userName{@[\\w-.]+}", (ctx) => {
  const user = ctx.req.param("userName").substring(1);
  return ctx.html(`<h1>${user}</h1>`);
});

serve(app.fetch);
