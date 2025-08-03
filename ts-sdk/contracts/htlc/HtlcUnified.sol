// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC20 {
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

contract HtlcUnified {
    struct Swap {
        address sender;
        address recipient;
        address token; // address(0) for ETH
        uint256 amount;
        bytes32 hashlock;
        uint256 timelock;
        bool claimed;
        bool refunded;
        bool exists;
    }

    mapping(bytes32 => Swap) public swaps;

    event Locked(
        bytes32 indexed swapId,
        address indexed sender,
        address indexed recipient,
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock
    );

    event Claimed(bytes32 indexed swapId, address indexed claimer);
    event Refunded(bytes32 indexed swapId, address indexed refunder);

    function lock(
        address recipient,
        bytes32 hashlock,
        uint256 timelock
    ) external payable returns (bytes32) {
        require(recipient != address(0), "Invalid recipient");
        require(timelock > block.timestamp, "Invalid timelock");
        require(msg.value > 0, "ETH amount must be > 0");

        bytes32 swapId = keccak256(
            abi.encodePacked(msg.sender, recipient, address(0), msg.value, hashlock, timelock)
        );
        require(!swaps[swapId].exists, "Swap already exists");

        swaps[swapId] = Swap({
            sender: msg.sender,
            recipient: recipient,
            token: address(0),
            amount: msg.value,
            hashlock: hashlock,
            timelock: timelock,
            claimed: false,
            refunded: false,
            exists: true
        });

        emit Locked(swapId, msg.sender, recipient, address(0), msg.value, hashlock, timelock);
        return swapId;
    }

    function lockToken(
        address recipient,
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock
    ) external returns (bytes32) {
        require(recipient != address(0), "Invalid recipient");
        require(token != address(0), "Invalid token");
        require(amount > 0, "Amount must be > 0");
        require(timelock > block.timestamp, "Invalid timelock");

        bytes32 swapId = keccak256(
            abi.encodePacked(msg.sender, recipient, token, amount, hashlock, timelock)
        );
        require(!swaps[swapId].exists, "Swap already exists");

        IERC20(token).transferFrom(msg.sender, address(this), amount);

        swaps[swapId] = Swap({
            sender: msg.sender,
            recipient: recipient,
            token: token,
            amount: amount,
            hashlock: hashlock,
            timelock: timelock,
            claimed: false,
            refunded: false,
            exists: true
        });

        emit Locked(swapId, msg.sender, recipient, token, amount, hashlock, timelock);
        return swapId;
    }

    function claim(bytes32 swapId, string memory secretHex) external {
        Swap storage swap = swaps[swapId];
        require(swap.exists, "Swap not found");
        require(msg.sender == swap.recipient, "Not the recipient");
        require(!swap.claimed, "Already claimed");
        require(block.timestamp <= swap.timelock, "Expired");

        bytes memory secret = hexStringToBytes(secretHex);
        bytes32 providedHash = sha256(secret);
        require(providedHash == swap.hashlock, "Invalid secret");

        swap.claimed = true;

        if (swap.token == address(0)) {
            (bool sent, ) = swap.recipient.call{value: swap.amount}("");
            require(sent, "ETH transfer failed");
        } else {
            IERC20(swap.token).transfer(swap.recipient, swap.amount);
        }

        emit Claimed(swapId, msg.sender);
    }

    function refund(bytes32 swapId) external {
        Swap storage swap = swaps[swapId];
        require(swap.exists, "Swap not found");
        require(msg.sender == swap.sender, "Not the sender");
        require(!swap.claimed, "Already claimed");
        require(!swap.refunded, "Already refunded");
        require(block.timestamp > swap.timelock, "Timelock not expired");

        swap.refunded = true;

        if (swap.token == address(0)) {
            (bool sent, ) = swap.sender.call{value: swap.amount}("");
            require(sent, "ETH refund failed");
        } else {
            IERC20(swap.token).transfer(swap.sender, swap.amount);
        }

        emit Refunded(swapId, msg.sender);
    }

    // --- 🔧 HEX STRING DECODER ---

    function hexCharToByte(bytes1 c) internal pure returns (uint8) {
        if (c >= "0" && c <= "9") return uint8(c) - uint8(bytes1("0"));
        if (c >= "a" && c <= "f") return 10 + uint8(c) - uint8(bytes1("a"));
        if (c >= "A" && c <= "F") return 10 + uint8(c) - uint8(bytes1("A"));
        revert("Invalid hex character");
    }

    function hexStringToBytes(string memory s) internal pure returns (bytes memory) {
        bytes memory ss = bytes(s);
        require(ss.length % 2 == 0, "Hex string must have even length");
        bytes memory result = new bytes(ss.length / 2);
        for (uint i = 0; i < ss.length / 2; ++i) {
            result[i] = bytes1(
                (hexCharToByte(ss[2 * i]) << 4) | hexCharToByte(ss[2 * i + 1])
            );
        }
        return result;
    }
}
