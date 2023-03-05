import * as base64 from "https://deno.land/std@0.178.0/encoding/base64.ts";
import { crypto } from "https://deno.land/std@0.178.0/crypto/mod.ts";

/** Sign Request with key */
export async function sign(
  request: Request,
  key: { privateKey: CryptoKey; keyId: string },
): Promise<Request> {
  const url = new URL(request.url);
  const singedHeaders = ["date", "digest", "host"];

  if (!request.headers.has("date")) {
    request.headers.set("date", new Date().toUTCString());
  }

  if (!request.headers.has("host")) {
    request.headers.set("host", url.host);
  }

  if (request.body !== null) {
    const digest = await crypto.subtle.digest("SHA-256", request.clone().body!);
    request.headers.set("digest", `SHA-256=${base64.encode(digest)}`);
  }

  const verifiableData = [
    `(request-target): ${request.method.toLowerCase()} ${url.pathname}${url.search}`,
  ]
    .concat(
      singedHeaders.map((headerKey) =>
        `${headerKey.toLowerCase()}: ${request.headers.get(headerKey)}`
      ),
    )
    .join("\n");

  const signature = await crypto.subtle.sign(
    { name: "RSA-PSS", saltLength: 32 },
    key.privateKey,
    new TextEncoder().encode(verifiableData),
  );
  request.headers.set(
    "signature",
    [
      ["keyId", key.keyId],
      ["algorithm", "rsa-sha256"],
      ["headers", `(request-target) ${singedHeaders.join(" ")}`],
      ["signature", base64.encode(signature)],
    ].map(([key, value]) => `${key}="${value}"`).join(","),
  );

  return request;
}

export async function verify(request: Request): Promise<boolean> {
  if (request.body !== null) {
    const [algo, digest] = request.headers.get("digest")?.split("=", 2) ?? [];
    console.log(Deno.inspect({ from: "verify", algo, digest }));
    if (!algo || !digest) {
      return false;
    }
    const bodyDigest = await crypto.subtle.digest(
      // deno-lint-ignore no-explicit-any
      algo as any,
      request.clone().body!,
    );
    // NOTE: trailing "=" characters are trimmed by `split()`
    if (digest !== base64.encode(bodyDigest).replace(/=+$/, "")) {
      console.log(Deno.inspect({
        from: "verify",
        digest,
        body: base64.encode(bodyDigest).replace(/=+$/, ""),
      }));
      return false;
    }
  }
  if (!request.headers.has("signature")) {
    return false;
  }
  return true;
}
