// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC20 {
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

// Define MakerTraits as a type alias for uint256 to resolve the compilation error
type MakerTraits is uint256;

// Full IOrderMixin interface based on 1inch Limit Order Protocol
interface IOrderMixin {
    struct Order {
        uint256 salt;
        address makerAsset;
        address takerAsset;
        address maker;
        address receiver;
        address allowedSender;
        uint256 makingAmount;
        uint256 takingAmount;
        uint256 offsets;
        bytes interactions; // Contains concatenated preInteraction, predicate, postInteraction, etc.
    }

    function fillOrder(Order calldata order, bytes calldata signature, bytes calldata interaction, uint256 makingAmount, uint256 takingAmount, uint256 skipPermitAndThresholdAmount) external returns (uint256 actualMakingAmount, uint256 actualTakingAmount, bytes32 orderHash);

    function cancelOrder(bytes32 orderHash) external;

    function hashOrder(Order calldata order) external view returns (bytes32);

    // Additional functions (optional for your use case)
    function checkPredicate(bytes calldata predicate) external view returns (bool);

    function bitInvalidatorForOrder(address maker, uint256 slot) external view returns (uint256);

    function remainingInvalidatorForOrder(address maker, bytes32 orderHash) external view returns (uint256);

    function rawRemainingInvalidatorForOrder(address maker, bytes32 orderHash) external view returns (uint256);

    function bitsInvalidateForOrder(MakerTraits makerTraits, uint256 additionalMask) external;

    // Events (not required in interface but for reference)
    event OrderCancelled(bytes32 indexed orderHash);
    event BitInvalidatorUpdated(address indexed maker, uint256 indexed slot, uint256 invalidator);
}

contract HtlcUnifiedWith1inch {
    // Original Swap struct and logic...
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

    // 1inch integration
    address public constant ONE_INCH_ADDRESS = 0x111111125421cA6dc452d289314280a0f8842A65; // Mainnet; replace with Sepolia if needed
    IOrderMixin public oneInch = IOrderMixin(ONE_INCH_ADDRESS);

    // Original lock for ETH
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

    // Original lockToken
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

    // Original claim
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

    // Original refund
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

    // --- Original HEX STRING DECODER ---
    // (kept as is)

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

    // --- 1inch Integration Functions ---

    // Lock using 1inch limit order (simplified; order creation is typically off-chain, but here we approve for fill)
    // Note: For full integration, orders are signed off-chain with predicates for timelock/hashlock.
    // This function approves the token to 1inch and emits event; actual order is created off-chain.
    function lockWith1inch(
        address recipient,
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock,
        bytes calldata predicateData // Encoded predicate (e.g., timestampBelow(timelock) and custom hashlock check)
    ) external payable returns (bytes32 swapId) {
        if (token == address(0)) {
            require(msg.value == amount, "ETH value mismatch");
        } else {
            IERC20(token).transferFrom(msg.sender, address(this), amount);
            IERC20(token).approve(ONE_INCH_ADDRESS, amount);
        }

        // Generate swapId similar to original
        swapId = keccak256(
            abi.encodePacked(msg.sender, recipient, token, amount, hashlock, timelock)
        );
        require(!swaps[swapId].exists, "Swap already exists");

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

        // Note: Create and sign the 1inch order off-chain with predicateData including hashlock check.
        // The predicate can be abi.encodePacked(timestampBelow.selector, timelock) or custom.
        // For hashlock, use a custom predicate contract that stores the hashlock and checks provided secret in interaction.
    }

    // Claim using 1inch fillOrder (filler provides secret in interaction)
    function claimWith1inch(
        IOrderMixin.Order calldata order,
        bytes calldata signature,
        bytes calldata interaction, // Includes secret for hashlock check
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 skipPermitAndThresholdAmount
    ) external {
        // Call 1inch fillOrder
        (uint256 actualMaking, uint256 actualTaking, bytes32 orderHash) = oneInch.fillOrder(
            order,
            signature,
            interaction,
            makingAmount,
            takingAmount,
            skipPermitAndThresholdAmount
        );

        // Update internal state if needed (map orderHash to swap)
        // For simplicity, emit claim event using orderHash as swapId
        emit Claimed(orderHash, msg.sender);

        // Transfer if needed, but since fillOrder handles transfer, may not be necessary.
    }

    // Refund by canceling the 1inch order
    function refundWith1inch(bytes32 orderHash) external {
        oneInch.cancelOrder(orderHash);

        // Update internal state if mapped
        emit Refunded(orderHash, msg.sender);
    }
}
