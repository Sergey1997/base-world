import { type Address, createPublicClient, formatUnits, type Hash, http, isAddress, maxUint256, parseUnits, type WalletClient } from "viem";
import { base } from "viem/chains";
import { type ChainAdapter, fmt, type Holdings, mockChain, type Token, tokens, type TxReceipt } from "./chain";
import {
  AAVE,
  aaveGatewayAbi,
  aavePoolAbi,
  AERODROME,
  aerodromeRouterAbi,
  DECIMALS,
  ERC20,
  erc20Abi,
  MORPHO,
  morphoAbi,
  wethAbi,
} from "./contracts";

/** Online play moves real money; every transaction is capped so a typo can't empty a wallet. */
export const MAX_TX_USD = 50;
const GAS_RESERVE = parseUnits("0.0003", 18);
const SLIPPAGE_BPS = 100n;
const TOKENS = Object.keys(DECIMALS) as Token[];

type Route = { from: Address; to: Address; stable: boolean; factory: Address };

const address = (t: Token): Address => (t === "ETH" ? ERC20.WETH : ERC20[t]);
const leg = (from: Address, to: Address): Route => ({ from, to, stable: false, factory: AERODROME.factory });
const explorer = (hash: Hash) => `https://basescan.org/tx/${hash}`;
const minus = (amount: bigint) => amount - (amount * SLIPPAGE_BPS) / 10_000n;
const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 600);

/**
 * The real thing: Aerodrome, Morpho Blue and Aave V3 on Base mainnet, signed by the player's wallet.
 * Features without a safe wallet-only path (veAERO votes, launchpads, hooks, flash loans) stay simulated.
 */
export function baseChain(wallet: WalletClient, account: Address, rpc?: string): ChainAdapter {
  const pub = createPublicClient({ chain: base, transport: http(rpc || undefined), batch: { multicall: true } });
  /** Last-read raw balances; amounts from the UI are clamped to these so "max" never overshoots by float rounding. */
  const raw: Record<Token, bigint> = { ETH: 0n, USDC: 0n, AERO: 0n, VIRTUAL: 0n };

  const units = (n: number, t: Token) => {
    const v = parseUnits(n.toFixed(DECIMALS[t]), DECIMALS[t]);
    return v > raw[t] && raw[t] > 0n ? raw[t] : v;
  };

  const cap = (usd: number) => {
    if (usd > MAX_TX_USD) throw new Error(`Online play caps each transaction at $${MAX_TX_USD} (this one is ~$${fmt(usd)}). Try a smaller amount.`);
  };

  const keepGas = (wei: bigint) => {
    if (wei + GAS_RESERVE > raw.ETH) throw new Error("Keep ~0.0003 ETH in your wallet for gas, or add funds first.");
  };

  const ready = async () => {
    if ((await wallet.getChainId()) !== base.id) await wallet.switchChain({ id: base.id });
  };

  const mined = async (hash: Hash) => {
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`Transaction reverted onchain (${hash.slice(0, 10)}…)`);
    return hash;
  };

  const allow = async (token: Address, spender: Address, amount: bigint) => {
    const current = await pub.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [account, spender] });
    if (current >= amount) return;
    await mined(await wallet.writeContract({ account, chain: base, address: token, abi: erc20Abi, functionName: "approve", args: [spender, amount] }));
  };

  const receipt = (hash: Hash, summary: string): TxReceipt => ({ hash, summary, at: Date.now(), explorer: explorer(hash) });

  /** Best of: direct pool, or one hop through WETH or USDC. */
  const route = async (from: Token, to: Token, amountIn: bigint) => {
    const a = address(from);
    const b = address(to);
    const candidates: Route[][] = [[leg(a, b)]];
    for (const hop of [ERC20.WETH, ERC20.USDC]) if (hop !== a && hop !== b) candidates.push([leg(a, hop), leg(hop, b)]);
    const quotes = await Promise.all(
      candidates.map((routes) =>
        pub
          .readContract({ address: AERODROME.router, abi: aerodromeRouterAbi, functionName: "getAmountsOut", args: [amountIn, routes] })
          .then((amounts) => amounts[amounts.length - 1])
          .catch(() => 0n),
      ),
    );
    const best = quotes.reduce((bi, q, i) => (q > quotes[bi] ? i : bi), 0);
    if (quotes[best] === 0n) throw new Error(`No Aerodrome route for ${from} → ${to} right now.`);
    return { routes: candidates[best], out: quotes[best] };
  };

  /** Spot prices in USDC from Aerodrome, so in-game quotes and the dollar cap track the real market. */
  const refreshPrices = async () => {
    await Promise.all(
      (["ETH", "AERO", "VIRTUAL"] as const).map(async (t) => {
        const { out } = await route(t, "USDC", parseUnits("1", DECIMALS[t]));
        tokens[t].usd = +formatUnits(out, DECIMALS.USDC);
      }),
    );
  };

  return {
    ...mockChain,
    network: "Base mainnet · real funds",

    async holdings(): Promise<Holdings> {
      await refreshPrices().catch((e) => console.warn("Price refresh failed", e));
      const balance = (token: Address) => pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account] });
      const [eth, usdc, aero, virtual, lp, aWeth, aDebt, position, market] = await Promise.all([
        pub.getBalance({ address: account }),
        balance(ERC20.USDC),
        balance(ERC20.AERO),
        balance(ERC20.VIRTUAL),
        balance(AERODROME.ethAeroPool),
        balance(AAVE.aWETH),
        balance(AAVE.vDebtUSDC),
        pub.readContract({ address: MORPHO.blue, abi: morphoAbi, functionName: "position", args: [MORPHO.marketId, account] }),
        pub.readContract({ address: MORPHO.blue, abi: morphoAbi, functionName: "market", args: [MORPHO.marketId] }),
      ]);
      Object.assign(raw, { ETH: eth, USDC: usdc, AERO: aero, VIRTUAL: virtual });
      const [, borrowShares, collateral] = position;
      const [, , totalBorrowAssets, totalBorrowShares] = market;
      const morphoDebt = totalBorrowShares > 0n ? (borrowShares * totalBorrowAssets + totalBorrowShares - 1n) / totalBorrowShares : 0n;
      const n = (v: bigint, t: Token) => +formatUnits(v, DECIMALS[t]);
      return {
        wallet: Object.fromEntries(TOKENS.map((t) => [t, n(raw[t], t)])) as Record<Token, number>,
        lp: +formatUnits(lp, 18),
        vaults: {
          morpho: { collateral: n(collateral, "ETH"), debt: n(morphoDebt, "USDC") },
          aave: { collateral: n(aWeth, "ETH"), debt: n(aDebt, "USDC") },
        },
      };
    },

    async swap(from, to, amountIn) {
      if (from === to) throw new Error("Pick two different tokens.");
      cap(amountIn * tokens[from].usd);
      const wei = units(amountIn, from);
      if (from === "ETH") keepGas(wei);
      await ready();
      const { routes, out } = await route(from, to, wei);
      const args = { account, chain: base, address: AERODROME.router, abi: aerodromeRouterAbi } as const;
      let hash: Hash;
      if (from === "ETH") {
        hash = await wallet.writeContract({ ...args, functionName: "swapExactETHForTokens", args: [minus(out), routes, account, deadline()], value: wei });
      } else {
        await allow(address(from), AERODROME.router, wei);
        hash = await wallet.writeContract({
          ...args,
          functionName: to === "ETH" ? "swapExactTokensForETH" : "swapExactTokensForTokens",
          args: [wei, minus(out), routes, account, deadline()],
        });
      }
      await mined(hash);
      const amountOut = +formatUnits(out, DECIMALS[to]);
      return { ...receipt(hash, `Swapped ${fmt(amountIn)} ${from} → ~${fmt(amountOut)} ${to} on Aerodrome`), amountOut };
    },

    async addLiquidity(eth, aero) {
      cap(eth * tokens.ETH.usd * 2);
      const ethWei = units(eth, "ETH");
      keepGas(ethWei);
      const aeroWei = units(aero * 1.01, "AERO");
      await ready();
      const [aeroUsed, ethUsed, liquidity] = await pub.readContract({
        address: AERODROME.router,
        abi: aerodromeRouterAbi,
        functionName: "quoteAddLiquidity",
        args: [ERC20.AERO, ERC20.WETH, false, AERODROME.factory, aeroWei, ethWei],
      });
      await allow(ERC20.AERO, AERODROME.router, aeroWei);
      const hash = await wallet.writeContract({
        account,
        chain: base,
        address: AERODROME.router,
        abi: aerodromeRouterAbi,
        functionName: "addLiquidityETH",
        args: [ERC20.AERO, false, aeroWei, minus(aeroUsed), minus(ethUsed), account, deadline()],
        value: ethWei,
      });
      await mined(hash);
      const lp = +formatUnits(liquidity, 18);
      return { ...receipt(hash, `Added ${fmt(+formatUnits(ethUsed, 18))} ETH + ${fmt(+formatUnits(aeroUsed, 18))} AERO to vAMM-WETH/AERO`), lp };
    },

    async supply(venue, eth) {
      cap(eth * tokens.ETH.usd);
      const wei = units(eth, "ETH");
      keepGas(wei);
      await ready();
      let hash: Hash;
      if (venue === "aave") {
        hash = await mined(await wallet.writeContract({ account, chain: base, address: AAVE.gateway, abi: aaveGatewayAbi, functionName: "depositETH", args: [AAVE.pool, account, 0], value: wei }));
      } else {
        const weth = await pub.readContract({ address: ERC20.WETH, abi: erc20Abi, functionName: "balanceOf", args: [account] });
        if (weth < wei) await mined(await wallet.writeContract({ account, chain: base, address: ERC20.WETH, abi: wethAbi, functionName: "deposit", value: wei - weth }));
        await allow(ERC20.WETH, MORPHO.blue, wei);
        hash = await mined(await wallet.writeContract({ account, chain: base, address: MORPHO.blue, abi: morphoAbi, functionName: "supplyCollateral", args: [MORPHO.market, wei, account, "0x"] }));
      }
      return receipt(hash, `Supplied ${fmt(eth)} ETH as collateral on ${venue === "aave" ? "Aave V3" : "Morpho"}`);
    },

    async borrow(venue, cash) {
      cap(cash);
      const wei = parseUnits(cash.toFixed(6), 6);
      await ready();
      const hash = await mined(
        venue === "aave"
          ? await wallet.writeContract({ account, chain: base, address: AAVE.pool, abi: aavePoolAbi, functionName: "borrow", args: [ERC20.USDC, wei, 2n, 0, account] })
          : await wallet.writeContract({ account, chain: base, address: MORPHO.blue, abi: morphoAbi, functionName: "borrow", args: [MORPHO.market, wei, 0n, account, account] }),
      );
      return receipt(hash, `Borrowed ${fmt(cash)} USDC on ${venue === "aave" ? "Aave V3" : "Morpho"}`);
    },

    async repay(venue, cash) {
      cap(cash);
      const wei = units(cash, "USDC");
      await ready();
      const { vaults } = await this.holdings!();
      const full = cash >= vaults[venue].debt - 1e-6;
      /** Interest accrues every block, so full repayment approves a hair more and repays by shares / max. */
      const approve = full ? (raw.USDC < (wei * 1001n) / 1000n ? raw.USDC : (wei * 1001n) / 1000n) : wei;
      let hash: Hash;
      if (venue === "aave") {
        await allow(ERC20.USDC, AAVE.pool, approve);
        hash = await mined(await wallet.writeContract({ account, chain: base, address: AAVE.pool, abi: aavePoolAbi, functionName: "repay", args: [ERC20.USDC, full ? maxUint256 : wei, 2n, account] }));
      } else {
        await allow(ERC20.USDC, MORPHO.blue, approve);
        const [, shares] = await pub.readContract({ address: MORPHO.blue, abi: morphoAbi, functionName: "position", args: [MORPHO.marketId, account] });
        hash = await mined(
          await wallet.writeContract({
            account,
            chain: base,
            address: MORPHO.blue,
            abi: morphoAbi,
            functionName: "repay",
            args: full ? [MORPHO.market, 0n, shares, account, "0x"] : [MORPHO.market, wei, 0n, account, "0x"],
          }),
        );
      }
      return receipt(hash, `Repaid ${full ? "the full loan" : `${fmt(cash)} USDC`} on ${venue === "aave" ? "Aave V3" : "Morpho"}`);
    },

    async send(to, token, amount) {
      if (!isAddress(to)) throw new Error("That isn't a valid 0x address.");
      cap(amount * tokens[token].usd);
      const wei = units(amount, token);
      if (token === "ETH") keepGas(wei);
      await ready();
      const hash = await mined(
        token === "ETH"
          ? await wallet.sendTransaction({ account, chain: base, to, value: wei })
          : await wallet.writeContract({ account, chain: base, address: ERC20[token], abi: erc20Abi, functionName: "transfer", args: [to, wei] }),
      );
      return receipt(hash, `Sent ${fmt(amount)} ${token} to ${to.slice(0, 6)}…${to.slice(-4)}`);
    },
  };
}
