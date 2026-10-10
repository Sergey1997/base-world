// Re-checks every Base mainnet address in components/world/contracts.ts against live chain state.
// Usage: pnpm verify:contracts
import { createPublicClient, encodeAbiParameters, getAddress, http, keccak256, parseUnits } from "viem";
import { base } from "viem/chains";
import {
  AAVE,
  aaveGatewayAbi,
  aavePoolAbi,
  aaveProviderAbi,
  aaveTokenAbi,
  AERODROME,
  aerodromeFactoryAbi,
  aerodromeRouterAbi,
  DECIMALS,
  ERC20,
  erc20Abi,
  MORPHO,
  morphoAbi,
} from "../components/world/contracts.ts";

const client = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL ?? "https://mainnet.base.org") });
const same = (a, b) => getAddress(a) === getAddress(b);
let failed = 0;
const check = async (label, fn) => {
  try {
    const detail = await fn();
    console.log(`✓ ${label}${detail ? ` — ${detail}` : ""}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${label} — ${e.shortMessage ?? e.message}`);
  }
};
const assert = (ok, msg) => {
  if (!ok) throw new Error(msg);
};
const hasCode = async (address) => assert((await client.getCode({ address }))?.length > 2, "no bytecode");

assert((await client.getChainId()) === 8453, "RPC is not Base mainnet");

for (const [sym, address] of Object.entries(ERC20)) {
  if (!address) continue;
  await check(`${sym} ${address}`, async () => {
    await hasCode(address);
    const [symbol, decimals] = await Promise.all([
      client.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
    ]);
    assert(symbol === sym, `symbol is ${symbol}`);
    assert(decimals === (DECIMALS[sym] ?? 18), `decimals is ${decimals}`);
    return `${symbol}, ${decimals} decimals`;
  });
}

await check(`Aerodrome Router ${AERODROME.router}`, async () => {
  await hasCode(AERODROME.router);
  const [factory, weth] = await Promise.all([
    client.readContract({ address: AERODROME.router, abi: aerodromeRouterAbi, functionName: "defaultFactory" }),
    client.readContract({ address: AERODROME.router, abi: aerodromeRouterAbi, functionName: "weth" }),
  ]);
  assert(same(factory, AERODROME.factory), `defaultFactory is ${factory}`);
  assert(same(weth, ERC20.WETH), `weth is ${weth}`);
  return "defaultFactory + weth match";
});

for (const [a, b] of [["WETH", "USDC"], ["WETH", "AERO"], ["USDC", "AERO"], ["WETH", "VIRTUAL"]]) {
  await check(`Aerodrome vAMM ${a}/${b} pool`, async () => {
    const pool = await client.readContract({ address: AERODROME.factory, abi: aerodromeFactoryAbi, functionName: "getPool", args: [ERC20[a], ERC20[b], false] });
    assert(!same(pool, "0x0000000000000000000000000000000000000000"), "pool does not exist");
    const amounts = await client.readContract({
      address: AERODROME.router,
      abi: aerodromeRouterAbi,
      functionName: "getAmountsOut",
      args: [parseUnits("1", DECIMALS[a === "WETH" ? "ETH" : a]), [{ from: ERC20[a], to: ERC20[b], stable: false, factory: AERODROME.factory }]],
    });
    assert(amounts[1] > 0n, "quote is zero");
    if (a === "WETH" && b === "AERO") assert(same(pool, AERODROME.ethAeroPool), `ethAeroPool should be ${pool}`);
    return pool;
  });
}

await check(`Morpho Blue ${MORPHO.blue}`, async () => {
  await hasCode(MORPHO.blue);
  const [loanToken, collateralToken, oracle, irm, lltv] = await client.readContract({ address: MORPHO.blue, abi: morphoAbi, functionName: "idToMarketParams", args: [MORPHO.marketId] });
  const m = MORPHO.market;
  assert(same(loanToken, m.loanToken) && same(collateralToken, m.collateralToken) && same(oracle, m.oracle) && same(irm, m.irm) && lltv === m.lltv, "market params differ");
  const id = keccak256(encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "uint256" }], [m.loanToken, m.collateralToken, m.oracle, m.irm, m.lltv]));
  assert(id === MORPHO.marketId, `params hash to ${id}`);
  const [, , borrowed] = await client.readContract({ address: MORPHO.blue, abi: morphoAbi, functionName: "market", args: [MORPHO.marketId] });
  return `WETH/USDC 86% market, ${(Number(borrowed) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })} USDC borrowed`;
});

await check(`Aave V3 Pool ${AAVE.pool}`, async () => {
  const pool = await client.readContract({ address: AAVE.provider, abi: aaveProviderAbi, functionName: "getPool" });
  assert(same(pool, AAVE.pool), `provider.getPool() is ${pool}`);
  await client.readContract({ address: AAVE.pool, abi: aavePoolAbi, functionName: "getUserAccountData", args: [AAVE.pool] });
  return "matches PoolAddressesProvider";
});

await check(`Aave WrappedTokenGateway ${AAVE.gateway}`, async () => {
  const weth = await client.readContract({ address: AAVE.gateway, abi: aaveGatewayAbi, functionName: "getWETHAddress" });
  assert(same(weth, ERC20.WETH), `WETH is ${weth}`);
  return "wraps canonical WETH";
});

for (const [label, address, underlying] of [["aBasWETH", AAVE.aWETH, ERC20.WETH], ["variableDebtBasUSDC", AAVE.vDebtUSDC, ERC20.USDC]]) {
  await check(`Aave ${label} ${address}`, async () => {
    const [asset, pool] = await Promise.all([
      client.readContract({ address, abi: aaveTokenAbi, functionName: "UNDERLYING_ASSET_ADDRESS" }),
      client.readContract({ address, abi: aaveTokenAbi, functionName: "POOL" }),
    ]);
    assert(same(asset, underlying), `underlying is ${asset}`);
    assert(same(pool, AAVE.pool), `pool is ${pool}`);
    return "underlying + pool match";
  });
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll contracts verified on Base mainnet.");
process.exit(failed ? 1 : 0);
