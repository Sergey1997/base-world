import { type Address, keccak256, parseAbi, parseEther, toHex } from "viem";
import { BASE_CHAIN_ID } from "@/components/world/contracts";

/** DuelEscrow on Base mainnet (contracts/src/DuelEscrow.sol). Override with NEXT_PUBLIC_DUEL_ESCROW if we redeploy. */
export const ESCROW = (process.env.NEXT_PUBLIC_DUEL_ESCROW || "0x7c940A30250b295Fe7A9E768B3E862FE60Ea2567") as Address;

export const escrowAbi = parseAbi([
  "function deposit(bytes32 id, address a, address b, uint256 stake, uint256 deadline, bytes ticket) payable",
  "function claim(bytes32 id, address winner, bytes result)",
  "function refund(bytes32 id)",
  "function duels(bytes32 id) view returns (address a, address b, uint128 stake, uint64 deadline, bool paidA, bool paidB, bool closed)",
]);

export const domain = (verifyingContract: Address) => ({ name: "BaseWorldDuel", version: "1", chainId: BASE_CHAIN_ID, verifyingContract }) as const;

export const ticketTypes = {
  Ticket: [
    { name: "id", type: "bytes32" },
    { name: "a", type: "address" },
    { name: "b", type: "address" },
    { name: "stake", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const resultTypes = {
  Result: [
    { name: "id", type: "bytes32" },
    { name: "winner", type: "address" },
  ],
} as const;

/** The duel's id onchain. */
export const duelKey = (id: string) => keccak256(toHex(id));

export const DEFAULT_STAKE = "0.001";
export const MIN_STAKE = parseEther("0.00001");
export const MAX_STAKE = parseEther("0.02");
export const FEE = 0.01;
/** Both stakes must land within this long of being matched. */
export const FUND_MS = 180_000;
/** A queued player waits this long for an opponent. */
export const QUEUE_MS = 120_000;
/** DuelEscrow.SETTLE_WINDOW: how long a funded duel waits for a result before stakes can be refunded. */
export const SETTLE_WINDOW_S = 86_400;

/** Signed by the referee: lets both players stake into exactly this duel. */
export interface Ticket {
  key: `0x${string}`;
  a: Address;
  b: Address;
  stake: string;
  deadline: number;
  sig: `0x${string}`;
}

/** Signed by the referee once the fight is decided; `winner` is the zero address for a draw. */
export interface Result {
  winner: Address;
  sig: `0x${string}`;
}
