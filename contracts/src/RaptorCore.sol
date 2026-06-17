// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IPyth.sol";

/// @title RaptorCore
/// @notice Policy-governed binary prediction markets resolved by Pyth oracle.
///         Deployed on GOAT Network Testnet (chainId 48816).
///         Agents register, deposit USDC, trade YES/NO on short BTC/USD windows,
///         and have their bets blocked on-chain when policy limits are exceeded.
contract RaptorCore is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum MarketStatus { Pending, Open, Halted, Closed }
    enum Side { Yes, No }
    enum Winner { None, Yes, No }

    struct AgentPolicy {
        uint128 maxStakePerWindow;
        uint8   maxOpenPositions;
        bytes32 allowedMarketsRoot; // bytes32(0) = unrestricted
        bool    paused;
    }

    struct Position {
        uint32  marketId;
        Side    side;
        uint128 amount;
        uint128 shares;
        bool    open;
    }

    struct AgentProfile {
        uint128      balance;
        AgentPolicy  policy;
        bool         registered;
        Position[16] positions;
    }

    struct Market {
        uint64       openTs;
        uint64       closeTs;
        int64        strike;
        MarketStatus status;
        bytes32      oracleFeed;
        uint128      yesReserve;
        uint128      noReserve;
        Winner       winner;
    }

    address public admin;
    address public treasury;
    address public operator; // can halt/resume markets; set by admin
    IERC20  public usdc;
    IPyth   public pyth;
    uint16  public feeBps;
    uint32  public marketCount;

    uint32  public constant MAX_POSITIONS  = 16;
    uint32  public constant ORACLE_MAX_AGE = 30;
    uint128 public constant MIN_SEED_LIQ   = 1_000_000;

    mapping(uint32  => Market)       public markets;
    mapping(address => AgentProfile) public agents;

    event MarketCreated(uint32 indexed id, uint64 openTs, uint64 closeTs, bytes32 oracleFeed);
    event MarketOpened(uint32 indexed id, int64 strike);
    event MarketClosed(uint32 indexed id, Winner winner, int64 finalPrice);
    event MarketHalted(uint32 indexed id);
    event MarketResumed(uint32 indexed id);
    event OperatorSet(address indexed operator);
    event AgentRegistered(address indexed agent);
    event PolicyUpdated(address indexed agent);
    event Deposited(address indexed agent, uint256 amount);
    event Withdrawn(address indexed agent, uint256 gross, uint256 fee, uint256 net);
    event BetPlaced(address indexed agent, uint32 indexed marketId, Side side, uint128 amount, uint128 shares);
    event BetCancelled(address indexed agent, uint32 indexed marketId);
    event PositionClosed(address indexed agent, uint32 indexed marketId);
    event PositionSettled(address indexed agent, uint32 indexed marketId, uint128 payout);

    error Unauthorized();
    error AlreadyRegistered();
    error NotRegistered();
    error MarketNotFound();
    error WrongStatus(MarketStatus current);
    error OracleStale();
    error OverPolicyCap();
    error TooManyPositions();
    error MarketNotAllowed();
    error AgentPaused();
    error InsufficientBalance();
    error NoOpenPosition();
    error NotClosed();
    error InvalidSeedLiquidity();
    error InvalidWindow();

    constructor(
        address _admin,
        address _treasury,
        address _usdc,
        address _pyth,
        uint16  _feeBps
    ) {
        admin    = _admin;
        treasury = _treasury;
        usdc     = IERC20(_usdc);
        pyth     = IPyth(_pyth);
        feeBps   = _feeBps;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != admin && msg.sender != operator) revert Unauthorized();
        _;
    }

    modifier onlyRegistered() {
        if (!agents[msg.sender].registered) revert NotRegistered();
        _;
    }

    /// @notice Admin grants operator role to a separate wallet (e.g. market_ops agent).
    function grantOperator(address _operator) external onlyAdmin {
        operator = _operator;
        emit OperatorSet(_operator);
    }

    function createMarket(uint64 openTs, uint64 closeTs, bytes32 oracleFeed)
        external onlyAdmin returns (uint32 id)
    {
        if (closeTs <= openTs) revert InvalidWindow();
        id = marketCount++;
        Market storage m = markets[id];
        m.openTs     = openTs;
        m.closeTs    = closeTs;
        m.oracleFeed = oracleFeed;
        m.status     = MarketStatus.Pending;
        emit MarketCreated(id, openTs, closeTs, oracleFeed);
    }

    function openMarket(uint32 id, uint128 seedLiquidity) external onlyAdmin {
        Market storage m = _requireMarket(id);
        if (m.status != MarketStatus.Pending) revert WrongStatus(m.status);
        if (seedLiquidity < MIN_SEED_LIQ) revert InvalidSeedLiquidity();
        int64 price  = _freshPrice(m.oracleFeed);
        m.strike     = price;
        m.yesReserve = seedLiquidity;
        m.noReserve  = seedLiquidity;
        m.status     = MarketStatus.Open;
        usdc.safeTransferFrom(treasury, address(this), seedLiquidity * 2);
        emit MarketOpened(id, price);
    }

    function closeMarket(uint32 id) external onlyAdmin {
        Market storage m = _requireMarket(id);
        if (m.status != MarketStatus.Open && m.status != MarketStatus.Halted)
            revert WrongStatus(m.status);
        int64 finalPrice = _freshPrice(m.oracleFeed);
        m.winner = finalPrice >= m.strike ? Winner.Yes : Winner.No;
        m.status = MarketStatus.Closed;
        emit MarketClosed(id, m.winner, finalPrice);
    }

    function haltMarket(uint32 id) external onlyOperator {
        Market storage m = _requireMarket(id);
        if (m.status != MarketStatus.Open) revert WrongStatus(m.status);
        m.status = MarketStatus.Halted;
        emit MarketHalted(id);
    }

    function resumeMarket(uint32 id) external onlyOperator {
        Market storage m = _requireMarket(id);
        if (m.status != MarketStatus.Halted) revert WrongStatus(m.status);
        m.status = MarketStatus.Open;
        emit MarketResumed(id);
    }

    function registerAgent() external {
        if (agents[msg.sender].registered) revert AlreadyRegistered();
        agents[msg.sender].registered = true;
        agents[msg.sender].policy = AgentPolicy({
            maxStakePerWindow:  500_000_000,
            maxOpenPositions:   4,
            allowedMarketsRoot: bytes32(0),
            paused:             false
        });
        emit AgentRegistered(msg.sender);
    }

    function updatePolicy(AgentPolicy calldata policy) external onlyRegistered {
        agents[msg.sender].policy = policy;
        emit PolicyUpdated(msg.sender);
    }

    function deposit(uint128 amount) external onlyRegistered nonReentrant {
        agents[msg.sender].balance += amount;
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint128 amount) external onlyRegistered nonReentrant {
        AgentProfile storage a = agents[msg.sender];
        if (a.balance < amount) revert InsufficientBalance();
        a.balance -= amount;
        uint128 fee = uint128((uint256(amount) * feeBps) / 10_000);
        uint128 net = amount - fee;
        if (fee > 0) usdc.safeTransfer(treasury, fee);
        usdc.safeTransfer(msg.sender, net);
        emit Withdrawn(msg.sender, amount, fee, net);
    }

    function placeBet(uint32 marketId, Side side, uint128 amount) external onlyRegistered {
        Market storage m = _requireMarket(marketId);
        AgentProfile storage a = agents[msg.sender];
        if (a.policy.paused) revert AgentPaused();
        if (m.status != MarketStatus.Open) revert WrongStatus(m.status);
        _freshPrice(m.oracleFeed);
        if (amount > a.policy.maxStakePerWindow) revert OverPolicyCap();
        if (a.policy.allowedMarketsRoot != bytes32(0) &&
            a.policy.allowedMarketsRoot != m.oracleFeed) revert MarketNotAllowed();

        uint8 openCount; int8 freeSlot = -1;
        for (uint8 i = 0; i < MAX_POSITIONS; i++) {
            if (a.positions[i].open) { openCount++; }
            else if (freeSlot < 0)   { freeSlot = int8(i); }
        }
        if (openCount >= a.policy.maxOpenPositions) revert TooManyPositions();
        if (freeSlot < 0) revert TooManyPositions();
        if (a.balance < amount) revert InsufficientBalance();

        uint128 shares = _cpmmBuy(m, side, amount);
        a.balance -= amount;
        a.positions[uint8(freeSlot)] = Position({ marketId: marketId, side: side, amount: amount, shares: shares, open: true });
        emit BetPlaced(msg.sender, marketId, side, amount, shares);
    }

    function cancelBet(uint32 marketId) external onlyRegistered nonReentrant {
        Market storage m = _requireMarket(marketId);
        if (m.status != MarketStatus.Open && m.status != MarketStatus.Halted)
            revert WrongStatus(m.status);
        AgentProfile storage a = agents[msg.sender];
        (, Position storage pos) = _findPosition(a, marketId);
        uint128 refund = _cpmmSell(m, pos.side, pos.shares);
        pos.open = false;
        a.balance += refund;
        emit BetCancelled(msg.sender, marketId);
    }

    function closePosition(uint32 marketId) external onlyRegistered nonReentrant {
        Market storage m = _requireMarket(marketId);
        if (m.status != MarketStatus.Open) revert WrongStatus(m.status);
        AgentProfile storage a = agents[msg.sender];
        (, Position storage pos) = _findPosition(a, marketId);
        uint128 proceeds = _cpmmSell(m, pos.side, pos.shares);
        pos.open = false;
        a.balance += proceeds;
        emit PositionClosed(msg.sender, marketId);
    }

    function settlePosition(uint32 marketId) external onlyRegistered nonReentrant {
        Market storage m = _requireMarket(marketId);
        if (m.status != MarketStatus.Closed) revert NotClosed();
        AgentProfile storage a = agents[msg.sender];
        (, Position storage pos) = _findPosition(a, marketId);
        uint128 payout = _calcPayout(m, pos);
        pos.open = false;
        a.balance += payout;
        emit PositionSettled(msg.sender, marketId, payout);
    }

    function settlePositions(uint32[] calldata marketIds) external onlyRegistered nonReentrant {
        AgentProfile storage a = agents[msg.sender];
        for (uint256 i = 0; i < marketIds.length; i++) {
            uint32 mid = marketIds[i];
            Market storage m = markets[mid];
            if (m.status != MarketStatus.Closed) continue;
            for (uint8 s = 0; s < MAX_POSITIONS; s++) {
                Position storage pos = a.positions[s];
                if (pos.open && pos.marketId == mid) {
                    uint128 payout = _calcPayout(m, pos);
                    pos.open = false;
                    a.balance += payout;
                    emit PositionSettled(msg.sender, mid, payout);
                    break;
                }
            }
        }
    }

    function getMarket(uint32 id) external view returns (Market memory) { return markets[id]; }

    function getAgent(address addr) external view returns (
        uint128 balance, AgentPolicy memory policy, bool registered
    ) {
        AgentProfile storage a = agents[addr];
        return (a.balance, a.policy, a.registered);
    }

    function getPositions(address addr) external view returns (Position[16] memory) {
        return agents[addr].positions;
    }

    function _requireMarket(uint32 id) internal view returns (Market storage m) {
        if (id >= marketCount) revert MarketNotFound();
        return markets[id];
    }

    function _freshPrice(bytes32 feedId) internal view returns (int64) {
        PythStructs.Price memory p = pyth.getPriceNoOlderThan(feedId, ORACLE_MAX_AGE);
        return p.price;
    }

    function _cpmmBuy(Market storage m, Side side, uint128 amount) internal returns (uint128 shares) {
        uint128 inR  = side == Side.Yes ? m.yesReserve : m.noReserve;
        uint128 outR = side == Side.Yes ? m.noReserve  : m.yesReserve;
        shares = uint128(uint256(inR) * amount / (uint256(outR) + amount));
        if (side == Side.Yes) { m.noReserve += amount; m.yesReserve -= shares; }
        else                  { m.yesReserve += amount; m.noReserve -= shares; }
    }

    function _cpmmSell(Market storage m, Side side, uint128 shares) internal returns (uint128 refund) {
        uint128 inR  = side == Side.Yes ? m.yesReserve : m.noReserve;
        uint128 outR = side == Side.Yes ? m.noReserve  : m.yesReserve;
        refund = uint128(uint256(outR) * shares / (uint256(inR) + shares));
        if (side == Side.Yes) { m.yesReserve += shares; m.noReserve -= refund; }
        else                  { m.noReserve += shares; m.yesReserve -= refund; }
    }

    function _calcPayout(Market storage m, Position storage pos) internal view returns (uint128) {
        bool won = (m.winner == Winner.Yes && pos.side == Side.Yes) ||
                   (m.winner == Winner.No  && pos.side == Side.No);
        if (!won) return 0;
        uint128 pool = m.yesReserve + m.noReserve;
        uint128 winR = m.winner == Winner.Yes ? m.yesReserve : m.noReserve;
        if (winR == 0) return 0;
        uint128 gross  = uint128(uint256(pool) * pos.shares / winR);
        uint128 profit = gross > pos.amount ? gross - pos.amount : 0;
        uint128 fee    = uint128((uint256(profit) * feeBps) / 10_000);
        return gross - fee;
    }

    function _findPosition(AgentProfile storage a, uint32 marketId)
        internal view returns (uint8 slot, Position storage pos)
    {
        for (uint8 i = 0; i < MAX_POSITIONS; i++) {
            if (a.positions[i].open && a.positions[i].marketId == marketId) {
                return (i, a.positions[i]);
            }
        }
        revert NoOpenPosition();
    }
}
