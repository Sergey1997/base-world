import { parseAbi, parseEther } from "viem";

/**
 * Every Base mainnet contract online mode touches. Sources: Aerodrome docs, Morpho API,
 * bgd-labs/aave-address-book (AaveV3Base). `pnpm verify:contracts` re-checks each one onchain.
 */
export const BASE_CHAIN_ID = 8453;

export const ERC20 = {
  ETH: null,
  WETH: "0x4200000000000000000000000000000000000006",
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  AERO: "0x940181a94A35A4569E4529A3CDfB74e38FD98631",
  VIRTUAL: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b",
} as const;

export const DECIMALS = { ETH: 18, USDC: 6, AERO: 18, VIRTUAL: 18 } as const;

export const AERODROME = {
  router: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43",
  factory: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
  /** vAMM-WETH/AERO, the pool behind the Liquidity Pool panel. */
  ethAeroPool: "0x7f670f78B17dEC44d5Ef68a48740b6f8849cc2e6",
} as const;

export const MORPHO = {
  blue: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
  /** WETH collateral / USDC loan, 86% LLTV — the deepest WETH/USDC market on Base. */
  marketId: "0x8793cf302b8ffd655ab97bd1c695dbd967807e8367a65cb2f4edaf1380ba1bda",
  market: {
    loanToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    collateralToken: "0x4200000000000000000000000000000000000006",
    oracle: "0xFEa2D58cEfCb9fcb597723c6bAE66fFE4193aFE4",
    irm: "0x46415998764C29aB2a25CbeA6254146D50D22687",
    lltv: parseEther("0.86"),
  },
} as const;

export const AAVE = {
  provider: "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D",
  pool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
  gateway: "0xa0d9C1E9E48Ca30c8d8C3B5D69FF5dc1f6DFfC24",
  aWETH: "0xD4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7",
  vDebtUSDC: "0x59dca05b6c26dbd64b5381374aAaC5CD05644C28",
} as const;

export const erc20Abi = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
]);

export const wethAbi = parseAbi(["function deposit() payable", "function withdraw(uint256)"]);

export const aerodromeRouterAbi = parseAbi([
  "struct Route { address from; address to; bool stable; address factory; }",
  "function defaultFactory() view returns (address)",
  "function weth() view returns (address)",
  "function getAmountsOut(uint256 amountIn, Route[] routes) view returns (uint256[] amounts)",
  "function swapExactETHForTokens(uint256 amountOutMin, Route[] routes, address to, uint256 deadline) payable returns (uint256[] amounts)",
  "function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, Route[] routes, address to, uint256 deadline) returns (uint256[] amounts)",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, Route[] routes, address to, uint256 deadline) returns (uint256[] amounts)",
  "function quoteAddLiquidity(address tokenA, address tokenB, bool stable, address factory, uint256 amountADesired, uint256 amountBDesired) view returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
  "function addLiquidityETH(address token, bool stable, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)",
]);

export const aerodromeFactoryAbi = parseAbi(["function getPool(address tokenA, address tokenB, bool stable) view returns (address)"]);

export const morphoAbi = parseAbi([
  "struct MarketParams { address loanToken; address collateralToken; address oracle; address irm; uint256 lltv; }",
  "function idToMarketParams(bytes32 id) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
  "function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
  "function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
  "function supplyCollateral(MarketParams marketParams, uint256 assets, address onBehalf, bytes data)",
  "function borrow(MarketParams marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) returns (uint256, uint256)",
  "function repay(MarketParams marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) returns (uint256, uint256)",
]);

export const aavePoolAbi = parseAbi([
  "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)",
  "function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) returns (uint256)",
  "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
]);

export const aaveProviderAbi = parseAbi(["function getPool() view returns (address)"]);

export const aaveGatewayAbi = parseAbi([
  "function depositETH(address pool, address onBehalfOf, uint16 referralCode) payable",
  "function getWETHAddress() view returns (address)",
]);

export const aaveTokenAbi = parseAbi(["function UNDERLYING_ASSET_ADDRESS() view returns (address)", "function POOL() view returns (address)"]);
