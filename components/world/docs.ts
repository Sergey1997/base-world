/** Condensed from docs.base.org. Each page ends in a quick check; passing it emits `doc:<id>`. */
export interface DocPage {
  id: string;
  section: "Quickstart" | "Solutions" | "Coding Agents" | "Get Funding";
  title: string;
  summary: string;
  points: string[];
  code?: string;
  url: string;
  check: { q: string; options: string[]; answer: number };
}

const DOCS = "https://docs.base.org";

export const docs: DocPage[] = [
  {
    id: "connect",
    section: "Quickstart",
    title: "Connect to Base",
    summary: "Base is a standard EVM chain, so any Ethereum tool, wallet or library works unchanged. Point it at the network details.",
    points: [
      "Mainnet: chain ID 8453, RPC https://mainnet.base.org, explorer basescan.org",
      "Base Sepolia testnet: chain ID 84532, RPC https://sepolia.base.org",
      "Send transactions to the sequencer endpoint (mainnet-sequencer.base.org); use the RPC for everything else",
      "Gas is paid in ETH",
    ],
    url: `${DOCS}/get-started/connect-to-base`,
    check: { q: "What is the chain ID of Base Mainnet?", options: ["1", "8453", "84532"], answer: 1 },
  },
  {
    id: "funds",
    section: "Quickstart",
    title: "Get Funds",
    summary: "You need a little ETH on Base for gas, plus whatever your app uses — usually USDC.",
    points: [
      "From a Coinbase account: withdraw ETH or USDC and pick Base as the network — often the fastest path, no bridge needed",
      "From another chain: bridge in from Ethereum, Solana or Bitcoin",
      "Testnet: free test ETH and USDC from the Base faucets; test USDC also from the Circle faucet",
    ],
    url: `${DOCS}/get-started/get-funds`,
    check: { q: "What's often the fastest way to fund a Base address on mainnet?", options: ["Mine it", "Withdraw from Coinbase to Base", "Wait for an airdrop"], answer: 1 },
  },
  {
    id: "transaction",
    section: "Quickstart",
    title: "Make a Transaction",
    summary: "Base uses Ethereum's transaction model. Here's a minimal send with viem — it confirms in under a second thanks to Flashblocks, for a fraction of a cent.",
    points: ["Never hardcode a private key — load it from an env var or secrets manager, server-side only"],
    code: `import { createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

const client = createWalletClient({
  account: privateKeyToAccount(process.env.KEY),
  chain: base,
  transport: http('https://mainnet.base.org'),
});

const hash = await client.sendTransaction({
  to: '0xRecipient', value: parseEther('0.001'),
});`,
    url: `${DOCS}/get-started/make-a-transaction`,
    check: { q: "Why do Base transactions confirm in under a second?", options: ["Flashblocks", "Proof of work", "They skip signatures"], answer: 0 },
  },
  {
    id: "bridge",
    section: "Quickstart",
    title: "Bridge to Base",
    summary: "Move ETH, stablecoins and tokens to and from Base.",
    points: [
      "Routes from a Coinbase account, Ethereum, Solana or Bitcoin",
      "Standard bridge contracts move ETH and ERC-20s between Ethereum (L1) and Base (L2)",
      "The Base–Solana bridge carries tokens and messages to Solana Mainnet",
    ],
    url: `${DOCS}/base-chain/network-information/ecosystem-bridges`,
    check: { q: "Base is a layer 2 on top of…", options: ["Bitcoin", "Solana", "Ethereum"], answer: 2 },
  },
  {
    id: "defi",
    section: "Solutions",
    title: "Integrate DeFi",
    summary: "Add trading, lending, borrowing or a vault-based earn product to your app using third-party protocols on Base. Users sign every transaction from their own wallet.",
    points: [
      "Trading: executable swap routes from the 0x Swap API",
      "Lending: supply USDC directly to Morpho or Aave markets",
      "Borrowing: borrow USDC against WETH and watch liquidation risk",
      "Earn: one-deposit USDC vaults on Morpho",
    ],
    url: `${DOCS}/get-started/integrate-defi`,
    check: { q: "Which protocol powers the one-deposit earn vaults in the guide?", options: ["Morpho", "Uniswap", "Bankr"], answer: 0 },
  },
  {
    id: "tokenize",
    section: "Solutions",
    title: "Tokenize Assets",
    summary: "Represent real-world assets with the B20 Asset standard — Base's native token standard — through one ERC-20-compatible surface.",
    points: [
      "Configurable precision (a stock token uses six decimals)",
      "Issuer roles, a supply ceiling and issuer-defined metadata",
      "Holder controls and distributions built in",
    ],
    url: `${DOCS}/get-started/issue-rwa`,
    check: { q: "Which token standard does Base use for real-world assets?", options: ["ERC-721", "B20", "BRC-20"], answer: 1 },
  },
  {
    id: "stablecoin",
    section: "Solutions",
    title: "Issue a Stablecoin",
    summary: "Run a fiat-backed stablecoin with minting, compliance and reconciliation built into the chain — created with one B20 factory call.",
    points: [
      "Mint as reserves grow (minter role, optional supply cap); burn on redemption",
      "Transfer policies restrict holders to KYC-approved accounts; block or recover a single account",
      "Pause transfers, mints or burns independently during an incident",
      "Tag operations with onchain memos to reconcile with offchain records",
    ],
    url: `${DOCS}/get-started/issue-stablecoins`,
    check: { q: "What should happen to supply when a holder redeems for fiat?", options: ["Mint more", "Burn it", "Nothing"], answer: 1 },
  },
  {
    id: "payments",
    section: "Solutions",
    title: "Accept Payments",
    summary: "Pick an onchain payment lifecycle for checkout, agentic payments, reconciliation, refunds and payouts.",
    points: [
      "Simple USDC payments wallet to wallet, or escrow-backed charges",
      "Authorize now, capture later; refund, void, split and batch payouts",
      "Agentic payments with x402: charge for an API, settle by usage, batch high-frequency calls",
    ],
    url: `${DOCS}/get-started/accept-payments`,
    check: { q: "Which protocol lets an API charge AI agents per request?", options: ["x402", "SMTP", "ERC-4626"], answer: 0 },
  },
  {
    id: "private",
    section: "Solutions",
    title: "Private Transactions",
    summary: "Run confidential enterprise payments with Base Ledgers: balances, transfers and counterparties stay private while funds settle onchain.",
    points: [
      "Deposit from Base into a ledger through the Portal contract — the recipient is encrypted onchain",
      "Withdraw back to Base without revealing the account behind it",
      "Selective disclosure for auditors and compliance",
    ],
    url: `${DOCS}/get-started/private-transactions`,
    check: { q: "What stays private on a Base Ledger?", options: ["Nothing", "Balances, transfers and counterparties", "Only the gas price"], answer: 1 },
  },
  {
    id: "agents",
    section: "Coding Agents",
    title: "Build with AI Agents",
    summary: "Give your AI coding assistant live access to Base docs.",
    points: [
      "Add the Base docs MCP server to Cursor or Claude Code",
      "Static indexes for any assistant: docs.base.org/llms.txt and llms-full.txt",
    ],
    code: `{
  "mcpServers": {
    "base-docs": { "url": "https://docs.base.org/mcp" }
  }
}`,
    url: `${DOCS}/get-started/docs-mcp`,
    check: { q: "Where does the Base docs MCP server live?", options: ["docs.base.org/mcp", "base.org/rpc", "basescan.org/api"], answer: 0 },
  },
  {
    id: "funding",
    section: "Get Funding",
    title: "Get Funded",
    summary: "Base backs builders at every stage.",
    points: [
      "Base Batches: an accelerator with investment, mentorship and a demo day",
      "Base Ecosystem Fund: pre-seed and seed checks, in partnership with Coinbase Ventures",
      "Builder Stack: credits and discounts on software for building on Base",
    ],
    url: `${DOCS}/get-started/base-batches`,
    check: { q: "Which program is an accelerator with a demo day?", options: ["Builder Stack", "Base Batches", "Flashblocks"], answer: 1 },
  },
];

export const docById = Object.fromEntries(docs.map((d) => [d.id, d])) as Record<string, DocPage>;
