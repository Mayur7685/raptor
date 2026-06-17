// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IPyth.sol";

/// @notice Testnet oracle stub. Scheduler pushes prices fetched from Hermes REST.
contract MockPyth is IPyth {
    mapping(bytes32 => PythStructs.Price) private _prices;

    function updatePrice(bytes32 feedId, int64 price, uint publishTime) external {
        _prices[feedId] = PythStructs.Price(price, 0, -8, publishTime);
    }

    function getPriceNoOlderThan(bytes32 id, uint age)
        external view override returns (PythStructs.Price memory)
    {
        PythStructs.Price memory p = _prices[id];
        require(block.timestamp - p.publishTime <= age, "OracleStale");
        return p;
    }

    function getUpdateFee(bytes[] calldata) external pure override returns (uint) { return 0; }
    function updatePriceFeeds(bytes[] calldata) external payable override {}
}
