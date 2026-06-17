// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/RaptorCore.sol";
import "../src/interfaces/IPyth.sol";

contract MockUSDCTest {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transferFrom(address f, address t, uint256 a) external returns (bool) {
        allowance[f][msg.sender] -= a; balanceOf[f] -= a; balanceOf[t] += a; return true;
    }
    function transfer(address t, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a; balanceOf[t] += a; return true;
    }
}

contract MockPythTest {
    int64  public price = 100_000_000_000;
    uint   public publishTime;
    constructor() { publishTime = block.timestamp; }
    function setPrice(int64 p) external { price = p; }
    function setAge(uint age) external  { publishTime = block.timestamp - age; }
    function getPriceNoOlderThan(bytes32, uint maxAge) external view returns (PythStructs.Price memory) {
        require(block.timestamp - publishTime <= maxAge, "Pyth: stale");
        return PythStructs.Price({ price: price, conf: 0, expo: -8, publishTime: publishTime });
    }
}

contract RaptorCoreTest is Test {
    RaptorCore    public core;
    MockUSDCTest  public usdc;
    MockPythTest  public pyth;

    address admin    = address(1);
    address treasury = address(2);
    address alice    = address(3);
    address bob      = address(4);

    bytes32 constant FEED = bytes32(uint256(1));
    uint128 constant SEED = 10_000_000;

    function setUp() public {
        usdc = new MockUSDCTest();
        pyth = new MockPythTest();
        vm.prank(admin);
        core = new RaptorCore(admin, treasury, address(usdc), address(pyth), 100);
        usdc.mint(treasury, 100_000_000);
        vm.prank(treasury); usdc.approve(address(core), type(uint256).max);
        usdc.mint(alice, 10_000_000); usdc.mint(bob, 10_000_000);
        vm.prank(alice); usdc.approve(address(core), type(uint256).max);
        vm.prank(bob);   usdc.approve(address(core), type(uint256).max);
    }

    function _openMarket() internal returns (uint32 id) {
        vm.startPrank(admin);
        id = core.createMarket(uint64(block.timestamp), uint64(block.timestamp + 300), FEED);
        core.openMarket(id, SEED);
        vm.stopPrank();
    }

    function _setup(address agent, uint128 amount) internal {
        vm.startPrank(agent);
        core.registerAgent();
        core.deposit(amount);
        vm.stopPrank();
    }

    function test_createMarket() public {
        vm.prank(admin);
        uint32 id = core.createMarket(uint64(block.timestamp + 10), uint64(block.timestamp + 310), FEED);
        assertEq(id, 0);
        assertEq(core.marketCount(), 1);
        assertEq(uint8(core.getMarket(id).status), uint8(RaptorCore.MarketStatus.Pending));
    }

    function test_openMarket() public {
        uint32 id = _openMarket();
        RaptorCore.Market memory m = core.getMarket(id);
        assertEq(uint8(m.status), uint8(RaptorCore.MarketStatus.Open));
        assertEq(m.yesReserve, SEED);
        assertEq(m.noReserve, SEED);
        assertEq(m.strike, pyth.price());
    }

    function test_haltAndResume() public {
        uint32 id = _openMarket();
        vm.prank(admin); core.haltMarket(id);
        assertEq(uint8(core.getMarket(id).status), uint8(RaptorCore.MarketStatus.Halted));
        vm.prank(admin); core.resumeMarket(id);
        assertEq(uint8(core.getMarket(id).status), uint8(RaptorCore.MarketStatus.Open));
    }

    function test_closeMarket_yesWins() public {
        uint32 id = _openMarket();
        vm.prank(admin); core.closeMarket(id);
        assertEq(uint8(core.getMarket(id).winner), uint8(RaptorCore.Winner.Yes));
    }

    function test_closeMarket_noWins() public {
        uint32 id = _openMarket();
        pyth.setPrice(pyth.price() - 1);
        vm.prank(admin); core.closeMarket(id);
        assertEq(uint8(core.getMarket(id).winner), uint8(RaptorCore.Winner.No));
    }

    function test_registerAgent() public {
        vm.prank(alice); core.registerAgent();
        (,, bool reg) = core.getAgent(alice);
        assertTrue(reg);
    }

    function test_revert_registerTwice() public {
        vm.prank(alice); core.registerAgent();
        vm.prank(alice);
        vm.expectRevert(RaptorCore.AlreadyRegistered.selector);
        core.registerAgent();
    }

    function test_depositAndBalance() public {
        _setup(alice, 1_000_000);
        (uint128 bal,,) = core.getAgent(alice);
        assertEq(bal, 1_000_000);
    }

    function test_withdraw() public {
        _setup(alice, 1_000_000);
        vm.prank(alice); core.withdraw(500_000);
        (uint128 bal,,) = core.getAgent(alice);
        assertEq(bal, 500_000);
    }

    function test_placeBet() public {
        uint32 id = _openMarket();
        _setup(alice, 2_000_000);
        vm.prank(alice); core.placeBet(id, RaptorCore.Side.Yes, 100_000);
        (uint128 bal,,) = core.getAgent(alice);
        assertEq(bal, 1_900_000);
    }

    function test_cancelBet_refunds() public {
        uint32 id = _openMarket();
        _setup(alice, 2_000_000);
        vm.prank(alice); core.placeBet(id, RaptorCore.Side.Yes, 100_000);
        vm.prank(alice); core.cancelBet(id);
        (uint128 bal,,) = core.getAgent(alice);
        assertGt(bal, 1_899_000);
    }

    function test_settlePosition_winner() public {
        uint32 id = _openMarket();
        _setup(alice, 2_000_000);
        vm.prank(alice); core.placeBet(id, RaptorCore.Side.Yes, 100_000);
        vm.prank(admin); core.closeMarket(id);
        (uint128 before,,) = core.getAgent(alice);
        vm.prank(alice); core.settlePosition(id);
        (uint128 after_,,) = core.getAgent(alice);
        assertGt(after_, before);
    }

    function test_settlePosition_loser() public {
        uint32 id = _openMarket();
        _setup(alice, 2_000_000);
        vm.prank(alice); core.placeBet(id, RaptorCore.Side.No, 100_000);
        vm.prank(admin); core.closeMarket(id);
        (uint128 before,,) = core.getAgent(alice);
        vm.prank(alice); core.settlePosition(id);
        (uint128 after_,,) = core.getAgent(alice);
        assertEq(after_, before);
    }

    function test_revert_overPolicyCap() public {
        uint32 id = _openMarket();
        _setup(alice, 2_000_000);
        vm.prank(alice); core.updatePolicy(RaptorCore.AgentPolicy({ maxStakePerWindow: 50_000, maxOpenPositions: 4, allowedMarketsRoot: bytes32(0), paused: false }));
        vm.prank(alice);
        vm.expectRevert(RaptorCore.OverPolicyCap.selector);
        core.placeBet(id, RaptorCore.Side.Yes, 100_000);
    }

    function test_revert_agentPaused() public {
        uint32 id = _openMarket();
        _setup(alice, 2_000_000);
        vm.prank(alice); core.updatePolicy(RaptorCore.AgentPolicy({ maxStakePerWindow: 500_000_000, maxOpenPositions: 4, allowedMarketsRoot: bytes32(0), paused: true }));
        vm.prank(alice);
        vm.expectRevert(RaptorCore.AgentPaused.selector);
        core.placeBet(id, RaptorCore.Side.Yes, 100_000);
    }

    function test_revert_marketNotAllowed() public {
        uint32 id = _openMarket();
        _setup(alice, 2_000_000);
        vm.prank(alice); core.updatePolicy(RaptorCore.AgentPolicy({ maxStakePerWindow: 500_000_000, maxOpenPositions: 4, allowedMarketsRoot: bytes32(uint256(999)), paused: false }));
        vm.prank(alice);
        vm.expectRevert(RaptorCore.MarketNotAllowed.selector);
        core.placeBet(id, RaptorCore.Side.Yes, 100_000);
    }

    function test_revert_oracleStale() public {
        uint32 id = _openMarket();
        _setup(alice, 2_000_000);
        vm.warp(block.timestamp + 31);
        vm.prank(alice);
        vm.expectRevert();
        core.placeBet(id, RaptorCore.Side.Yes, 100_000);
    }

    function test_revert_betOnHalted() public {
        uint32 id = _openMarket();
        _setup(alice, 2_000_000);
        vm.prank(admin); core.haltMarket(id);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RaptorCore.WrongStatus.selector, RaptorCore.MarketStatus.Halted));
        core.placeBet(id, RaptorCore.Side.Yes, 100_000);
    }

    function test_revert_insufficientBalance() public {
        uint32 id = _openMarket();
        _setup(alice, 50_000);
        vm.prank(alice);
        vm.expectRevert(RaptorCore.InsufficientBalance.selector);
        core.placeBet(id, RaptorCore.Side.Yes, 100_000);
    }

    function test_revert_nonAdminCreateMarket() public {
        vm.prank(alice);
        vm.expectRevert(RaptorCore.Unauthorized.selector);
        core.createMarket(uint64(block.timestamp), uint64(block.timestamp + 100), FEED);
    }

    function test_grantOperator_haltResume() public {
        uint32 id = _openMarket();
        // alice is granted operator role
        vm.prank(admin); core.grantOperator(alice);
        assertEq(core.operator(), alice);
        // alice can halt and resume
        vm.prank(alice); core.haltMarket(id);
        assertEq(uint8(core.getMarket(id).status), uint8(RaptorCore.MarketStatus.Halted));
        vm.prank(alice); core.resumeMarket(id);
        assertEq(uint8(core.getMarket(id).status), uint8(RaptorCore.MarketStatus.Open));
    }

    function test_revert_nonOperatorHalt() public {
        uint32 id = _openMarket();
        vm.prank(alice); // alice is not operator
        vm.expectRevert(RaptorCore.Unauthorized.selector);
        core.haltMarket(id);
    }
}
