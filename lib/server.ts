import { PrivyClient } from "@privy-io/node";
import { createClient } from "@supabase/supabase-js";

const lazy = <T>(make: () => T) => {
  let value: T | undefined;
  return () => (value ??= make());
};

const privy = lazy(() => new PrivyClient({ appId: env("NEXT_PUBLIC_PRIVY_APP_ID"), appSecret: env("PRIVY_APP_SECRET") }));

/** Server-only Supabase client. Tables have RLS with no policies, so only this key can read or write them. */
export const db = lazy(() =>
  createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), { auth: { persistSession: false, autoRefreshToken: false } }),
);

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new HttpError(503, `Online mode is not configured: set ${name} in .env.local`);
  return value;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The Privy user id behind the request's bearer token, or a 401. */
export async function playerId(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Missing access token");
  try {
    return (await privy().utils().auth().verifyAccessToken(token)).user_id;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(401, "Invalid or expired access token");
  }
}

type Account = { type: string; address?: string; chain_type?: string; username?: string | null; name?: string | null; email?: string | null };

/** Display name and Ethereum wallets, straight from Privy rather than from the client. */
export async function profile(id: string) {
  const user = await privy().users()._get(id);
  const accounts = user.linked_accounts as unknown as Account[];
  const find = (type: string) => accounts.find((a) => a.type === type);
  const wallets = accounts.filter((a) => a.type === "wallet" && a.chain_type === "ethereum" && a.address).map((a) => a.address!.toLowerCase());
  const short = wallets[0] && `${wallets[0].slice(0, 6)}…${wallets[0].slice(-4)}`;
  const name =
    find("twitter_oauth")?.username ??
    find("farcaster")?.username ??
    find("github_oauth")?.username ??
    find("google_oauth")?.name ??
    find("email")?.address?.split("@")[0] ??
    short ??
    "Builder";
  return { name: name.slice(0, 24), wallets };
}

export function handle(fn: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    try {
      return await fn(request);
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      console.error(e);
      return Response.json({ error: "Server error" }, { status: 500 });
    }
  };
}
