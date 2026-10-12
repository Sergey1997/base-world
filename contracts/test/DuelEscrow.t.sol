// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {DuelEscrow} from "../src/DuelEscrow.sol";

interface Vm {
    function deal(address who, uint256 amount) external;
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
    function addr(uint256 key) external returns (address);
    function sign(uint256 key, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function expectRevert(bytes4 selector) external;
}

/// Refuses ETH, so payouts to it must not block anyone else.
contract Rejector {
    function stake(DuelEscrow e, bytes32 id, address a, address b, uint256 s, uint256 deadline, bytes calldata t) external payable {
        e.deposit{value: msg.value}(id, a, b, s, deadline, t);
    }

    receive() external payable {
        revert();
    }
}

/// Tries to claim again while being paid.
contract Reenterer {
    DuelEscrow public e;
    bytes32 public id;
    bytes public result;

    function stake(DuelEscrow e_, bytes32 id_, address a, address b, uint256 s, uint256 deadline, bytes calldata t) external payable {
        e = e_;
        id = id_;
        e.deposit{value: msg.value}(id_, a, b, s, deadline, t);
    }

    function arm(bytes calldata r) external {
        result = r;
    }

    receive() external payable {
        e.claim(id, address(this), result);
    }
}

contract DuelEscrowTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 constant TICKET = keccak256("Ticket(bytes32 id,address a,address b,uint256 stake,uint256 deadline)");
    bytes32 constant RESULT = keccak256("Result(bytes32 id,address winner)");
    address constant TREASURY = 0xba3F8fCE8DC521Cddcb6DCA1720b84AD59F868F6;
    uint256 constant REFEREE_KEY = 0xA11CE;
    uint256 constant STAKE = 0.001 ether;
    bytes32 constant ID = keccak256("duel-1");

    DuelEscrow escrow;
    address referee;
    address a;
    address b;
    uint256 deadline;

    function setUp() public {
        referee = vm.addr(REFEREE_KEY);
        a = vm.addr(1);
        b = vm.addr(2);
        vm.deal(a, 1 ether);
        vm.deal(b, 1 ether);
        vm.warp(1_000_000);
        deadline = block.timestamp + 180;
        escrow = new DuelEscrow(TREASURY, referee);
    }

    // ---- helpers

    function signed(uint256 key, DuelEscrow e, bytes32 structHash) internal returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", e.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function ticket(address pa, address pb, uint256 amount) internal returns (bytes memory) {
        return signed(REFEREE_KEY, escrow, keccak256(abi.encode(TICKET, ID, pa, pb, amount, deadline)));
    }

    function result(address winner) internal returns (bytes memory) {
        return signed(REFEREE_KEY, escrow, keccak256(abi.encode(RESULT, ID, winner)));
    }

    function stake(address who) internal {
        bytes memory t = ticket(a, b, STAKE);
        vm.prank(who);
        escrow.deposit{value: STAKE}(ID, a, b, STAKE, deadline, t);
    }

    function fund() internal {
        stake(a);
        stake(b);
    }

    function eq(uint256 x, uint256 y, string memory what) internal pure {
        require(x == y, what);
    }

    // ---- payouts

    function test_WinnerTakesPotMinusOnePercent() public {
        fund();
        bytes memory r = result(a);
        vm.prank(b);
        escrow.claim(ID, a, r);
        eq(a.balance, 1 ether - STAKE + 0.00198 ether, "winner payout");
        eq(b.balance, 1 ether - STAKE, "loser keeps nothing back");
        eq(escrow.fees(), 0.00002 ether, "fee");
        escrow.sweep();
        eq(TREASURY.balance, 0.00002 ether, "treasury");
        eq(address(escrow).balance, 0, "escrow empty");
    }

    function test_DrawRefundsBothWithoutFee() public {
        fund();
        escrow.claim(ID, address(0), result(address(0)));
        eq(a.balance, 1 ether, "a refunded");
        eq(b.balance, 1 ether, "b refunded");
        eq(escrow.fees(), 0, "no fee");
    }

    function test_AnyStakeAmountWorks() public {
        uint256 tiny = 1 gwei;
        bytes memory t = ticket(a, b, tiny);
        vm.prank(a);
        escrow.deposit{value: tiny}(ID, a, b, tiny, deadline, t);
        vm.prank(b);
        escrow.deposit{value: tiny}(ID, a, b, tiny, deadline, t);
        escrow.claim(ID, b, result(b));
        eq(b.balance, 1 ether - tiny + (tiny * 2 * 99) / 100, "tiny payout");
    }

    // ---- deposits

    function test_RejectsForgedTicket() public {
        bytes memory t = signed(0xBAD, escrow, keccak256(abi.encode(TICKET, ID, a, b, STAKE, deadline)));
        vm.prank(a);
        vm.expectRevert(DuelEscrow.BadSignature.selector);
        escrow.deposit{value: STAKE}(ID, a, b, STAKE, deadline, t);
    }

    function test_RejectsTicketForAnotherEscrow() public {
        DuelEscrow other = new DuelEscrow(TREASURY, referee);
        bytes memory t = signed(REFEREE_KEY, other, keccak256(abi.encode(TICKET, ID, a, b, STAKE, deadline)));
        vm.prank(a);
        vm.expectRevert(DuelEscrow.BadSignature.selector);
        escrow.deposit{value: STAKE}(ID, a, b, STAKE, deadline, t);
    }

    function test_StakeMustMatchTicket() public {
        bytes memory t = ticket(a, b, STAKE);
        vm.prank(a);
        vm.expectRevert(DuelEscrow.WrongStake.selector);
        escrow.deposit{value: STAKE - 1}(ID, a, b, STAKE, deadline, t);
    }

    function test_SecondDepositMustMatchTheDuel() public {
        stake(a);
        bytes memory t = ticket(a, b, STAKE * 2);
        vm.prank(b);
        vm.expectRevert(DuelEscrow.BadTicket.selector);
        escrow.deposit{value: STAKE * 2}(ID, a, b, STAKE * 2, deadline, t);
    }

    function test_OnlyThePlayersCanDeposit() public {
        address c = vm.addr(3);
        vm.deal(c, 1 ether);
        bytes memory t = ticket(a, b, STAKE);
        vm.prank(c);
        vm.expectRevert(DuelEscrow.NotPlayer.selector);
        escrow.deposit{value: STAKE}(ID, a, b, STAKE, deadline, t);
    }

    function test_CannotDepositTwice() public {
        stake(a);
        bytes memory t = ticket(a, b, STAKE);
        vm.prank(a);
        vm.expectRevert(DuelEscrow.AlreadyPaid.selector);
        escrow.deposit{value: STAKE}(ID, a, b, STAKE, deadline, t);
    }

    function test_CannotDepositAfterDeadline() public {
        bytes memory t = ticket(a, b, STAKE);
        vm.warp(deadline + 1);
        vm.prank(a);
        vm.expectRevert(DuelEscrow.Expired.selector);
        escrow.deposit{value: STAKE}(ID, a, b, STAKE, deadline, t);
    }

    // ---- claims

    function test_RejectsForgedResult() public {
        fund();
        bytes memory r = signed(0xBAD, escrow, keccak256(abi.encode(RESULT, ID, a)));
        vm.expectRevert(DuelEscrow.BadSignature.selector);
        escrow.claim(ID, a, r);
    }

    function test_ResultCannotBeRedirected() public {
        fund();
        bytes memory r = result(a);
        vm.expectRevert(DuelEscrow.BadSignature.selector);
        escrow.claim(ID, b, r);
    }

    function test_WinnerMustBeAPlayer() public {
        fund();
        address c = vm.addr(3);
        bytes memory r = result(c);
        vm.expectRevert(DuelEscrow.NotPlayer.selector);
        escrow.claim(ID, c, r);
    }

    function test_CannotClaimTwice() public {
        fund();
        bytes memory r = result(a);
        escrow.claim(ID, a, r);
        vm.expectRevert(DuelEscrow.Closed.selector);
        escrow.claim(ID, a, r);
    }

    function test_CannotClaimHalfFundedDuel() public {
        stake(a);
        bytes memory r = result(a);
        vm.expectRevert(DuelEscrow.NotFunded.selector);
        escrow.claim(ID, a, r);
    }

    function test_ReenteringWinnerIsPaidOnce() public {
        Reenterer evil = new Reenterer();
        vm.deal(address(evil), 0);
        vm.deal(address(this), 1 ether);
        bytes memory t = ticket(address(evil), b, STAKE);
        evil.stake{value: STAKE}(escrow, ID, address(evil), b, STAKE, deadline, t);
        vm.prank(b);
        escrow.deposit{value: STAKE}(ID, address(evil), b, STAKE, deadline, t);
        bytes memory r = result(address(evil));
        evil.arm(r);
        escrow.claim(ID, address(evil), r);
        eq(address(evil).balance + escrow.owed(address(evil)), 0.00198 ether, "paid exactly once");
        eq(address(escrow).balance, escrow.fees() + escrow.owed(address(evil)), "nothing else left");
    }

    // ---- refunds

    function test_RefundsLoneDepositAfterDeadline() public {
        stake(a);
        vm.expectRevert(DuelEscrow.TooEarly.selector);
        escrow.refund(ID);
        vm.warp(deadline + 1);
        escrow.refund(ID);
        eq(a.balance, 1 ether, "a refunded");
    }

    function test_RefundsFundedDuelOnlyAfterSettleWindow() public {
        fund();
        vm.warp(deadline + 1);
        vm.expectRevert(DuelEscrow.TooEarly.selector);
        escrow.refund(ID);
        vm.warp(deadline + escrow.SETTLE_WINDOW() + 1);
        escrow.refund(ID);
        eq(a.balance, 1 ether, "a refunded");
        eq(b.balance, 1 ether, "b refunded");
    }

    function test_NoRefundAfterClaim() public {
        fund();
        escrow.claim(ID, a, result(a));
        vm.warp(deadline + escrow.SETTLE_WINDOW() + 1);
        vm.expectRevert(DuelEscrow.Closed.selector);
        escrow.refund(ID);
    }

    function test_NoClaimAfterRefund() public {
        fund();
        vm.warp(deadline + escrow.SETTLE_WINDOW() + 1);
        escrow.refund(ID);
        bytes memory r = result(a);
        vm.expectRevert(DuelEscrow.Closed.selector);
        escrow.claim(ID, a, r);
    }

    function test_RejectingWalletDoesNotBlockTheOtherRefund() public {
        Rejector rej = new Rejector();
        vm.deal(address(this), 1 ether);
        bytes memory t = ticket(address(rej), b, STAKE);
        rej.stake{value: STAKE}(escrow, ID, address(rej), b, STAKE, deadline, t);
        vm.prank(b);
        escrow.deposit{value: STAKE}(ID, address(rej), b, STAKE, deadline, t);
        vm.warp(deadline + escrow.SETTLE_WINDOW() + 1);
        escrow.refund(ID);
        eq(b.balance, 1 ether, "b refunded");
        eq(escrow.owed(address(rej)), STAKE, "rejector's stake kept for withdrawal");
    }

    // ---- admin

    function test_OnlyOwnerChangesReferee() public {
        vm.prank(a);
        vm.expectRevert(DuelEscrow.NotOwner.selector);
        escrow.setReferee(a);
        escrow.setReferee(a);
        require(escrow.referee() == a, "referee");
    }

    function test_SweepAlwaysPaysTreasury() public {
        fund();
        escrow.claim(ID, b, result(b));
        vm.prank(a);
        escrow.sweep();
        eq(TREASURY.balance, 0.00002 ether, "treasury");
        vm.expectRevert(DuelEscrow.Nothing.selector);
        escrow.sweep();
    }

    receive() external payable {}
}
