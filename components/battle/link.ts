import type { Address, Hash, PublicClient, Transport, WalletClient } from "viem";
import type { base } from "viem/chains";

/** What staked duels need from an online session. Offline mode never sets it, so only bot fights are offered there. */
export interface PvpLink {
  account: Address;
  wallet: WalletClient;
  chain: PublicClient<Transport, typeof base>;
  /** Fetch against our API with the player's access token. Throws the server's error message. */
  api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>;
  /** Listens on a private duel topic; returns an unsubscribe. */
  listen(topic: string, on: (event: string, payload: Record<string, unknown>) => void): () => void;
  /** Records a confirmed transaction in the player's history. */
  logTx(hash: Hash, summary: string): void;
}

export let pvp: PvpLink | null = null;

export function connectPvp(link: PvpLink | null) {
  pvp = link;
}
