// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Base World duel escrow
/// @notice Two players stake the same ETH on a duel. The game server (the referee) only signs:
///         a ticket that sets up the duel, and the result once it's over. Whoever holds the result
///         signature can settle it, but the money only ever goes to the duel's two players and the treasury.
///         The winner takes the pot minus a 1% fee. A draw refunds both stakes with no fee.
///         If the second stake never lands, or the referee never signs, the money comes back after a timeout.
contract DuelEscrow {
    uint256 public constant FEE_BPS = 100;
    /// @notice How long after the funding deadline a fully funded duel waits for a result before it can be refunded.
    uint256 public constant SETTLE_WINDOW = 1 days;

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant TICKET_TYPEHASH =
        keccak256("Ticket(bytes32 id,address a,address b,uint256 stake,uint256 deadline)");
    bytes32 private constant RESULT_TYPEHASH = keccak256("Result(bytes32 id,address winner)");
    uint256 private constant PAY_GAS = 50_000;
    uint256 private constant HALF_N = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    struct Duel {
        address a;
        address b;
        uint128 stake;
        uint64 deadline;
        bool paidA;
        bool paidB;
        bool closed;
    }

    address public immutable treasury;
    address public owner;
    address public referee;
    /// @notice Fees collected and not yet swept to the treasury.
    uint256 public fees;
    /// @notice Payouts whose transfer failed (e.g. a contract wallet that rejects ETH); withdraw with `withdraw`.
    mapping(address => uint256) public owed;
    mapping(bytes32 => Duel) public duels;

    uint256 private locked = 1;

    event Deposited(bytes32 indexed id, address indexed player, uint256 stake);
    event Settled(bytes32 indexed id, address indexed winner, uint256 payout, uint256 fee);
    event Refunded(bytes32 indexed id);
    event RefereeChanged(address referee);
    event OwnerChanged(address owner);

    error BadSignature();
    error BadTicket();
    error NotPlayer();
    error WrongStake();
    error AlreadyPaid();
    error Expired();
    error NotFunded();
    error Closed();
    error TooEarly();
    error NotOwner();
    error Reentrant();
    error Nothing();

    modifier nonReentrant() {
        if (locked != 1) revert Reentrant();
        locked = 2;
        _;
        locked = 1;
    }

    constructor(address treasury_, address referee_) {
        require(treasury_ != address(0) && referee_ != address(0));
        treasury = treasury_;
        referee = referee_;
        owner = msg.sender;
    }

    /// @notice Stake into a duel. The first deposit opens it with the referee's ticket; the second must match it.
    function deposit(bytes32 id, address a, address b, uint256 stake, uint256 deadline, bytes calldata ticket) external payable {
        if (block.timestamp > deadline) revert Expired();
        if (msg.value != stake || stake == 0 || stake > type(uint128).max) revert WrongStake();
        Duel storage d = duels[id];
        if (d.a == address(0)) {
            if (a == address(0) || b == address(0) || a == b) revert BadTicket();
            bytes32 digest = _digest(keccak256(abi.encode(TICKET_TYPEHASH, id, a, b, stake, deadline)));
            if (_recover(digest, ticket) != referee) revert BadSignature();
            d.a = a;
            d.b = b;
            d.stake = uint128(stake);
            d.deadline = uint64(deadline);
        } else if (d.a != a || d.b != b || d.stake != stake || d.deadline != deadline) revert BadTicket();
        if (d.closed) revert Closed();
        if (msg.sender == d.a) {
            if (d.paidA) revert AlreadyPaid();
            d.paidA = true;
        } else if (msg.sender == d.b) {
            if (d.paidB) revert AlreadyPaid();
            d.paidB = true;
        } else revert NotPlayer();
        emit Deposited(id, msg.sender, stake);
    }

    /// @notice Pays out a finished duel with the referee's result. `winner` is a player, or address(0) for a draw.
    function claim(bytes32 id, address winner, bytes calldata result) external nonReentrant {
        Duel storage d = duels[id];
        if (!d.paidA || !d.paidB) revert NotFunded();
        if (d.closed) revert Closed();
        if (winner != d.a && winner != d.b && winner != address(0)) revert NotPlayer();
        bytes32 digest = _digest(keccak256(abi.encode(RESULT_TYPEHASH, id, winner)));
        if (_recover(digest, result) != referee) revert BadSignature();
        d.closed = true;
        uint256 stake = d.stake;
        if (winner == address(0)) {
            emit Settled(id, address(0), 0, 0);
            _pay(d.a, stake);
            _pay(d.b, stake);
            return;
        }
        uint256 pot = stake * 2;
        uint256 fee = (pot * FEE_BPS) / 10_000;
        fees += fee;
        emit Settled(id, winner, pot - fee, fee);
        _pay(winner, pot - fee);
    }

    /// @notice Returns stakes when a duel never got both deposits by its deadline,
    ///         or was funded but never received a result within the settle window.
    function refund(bytes32 id) external nonReentrant {
        Duel storage d = duels[id];
        if (d.a == address(0)) revert NotFunded();
        if (d.closed) revert Closed();
        uint256 opens = d.paidA && d.paidB ? uint256(d.deadline) + SETTLE_WINDOW : d.deadline;
        if (block.timestamp <= opens) revert TooEarly();
        d.closed = true;
        emit Refunded(id);
        if (d.paidA) _pay(d.a, d.stake);
        if (d.paidB) _pay(d.b, d.stake);
    }

    /// @notice Sends collected fees to the treasury. Anyone can call it; the money only goes one place.
    function sweep() external nonReentrant {
        uint256 amount = fees;
        if (amount == 0) revert Nothing();
        fees = 0;
        (bool ok,) = treasury.call{value: amount}("");
        require(ok);
    }

    function withdraw() external nonReentrant {
        uint256 amount = owed[msg.sender];
        if (amount == 0) revert Nothing();
        owed[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok);
    }

    function setReferee(address referee_) external {
        if (msg.sender != owner) revert NotOwner();
        require(referee_ != address(0));
        referee = referee_;
        emit RefereeChanged(referee_);
    }

    function setOwner(address owner_) external {
        if (msg.sender != owner) revert NotOwner();
        owner = owner_;
        emit OwnerChanged(owner_);
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("BaseWorldDuel"), keccak256("1"), block.chainid, address(this)));
    }

    function _digest(bytes32 structHash) private view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    function _recover(bytes32 digest, bytes calldata sig) private pure returns (address signer) {
        if (sig.length != 65) revert BadSignature();
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (uint256(s) > HALF_N || (v != 27 && v != 28)) revert BadSignature();
        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert BadSignature();
    }

    /// @dev Never lets one recipient block another: a failed or gas-hungry transfer is kept for them to withdraw.
    function _pay(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount, gas: PAY_GAS}("");
        if (!ok) owed[to] += amount;
    }
}
