module htlc::swap {
    use sui::coin::Coin;
    use sui::tx_context::sender;
    use std::hash;
    use sui::object::{delete, new};
    use sui::clock::Clock;
    use sui::clock;

    const EInsufficientAmount: u64 = 0;
    /// const EAlreadyClaimed: u64 = 1;
    /// const EInvalidPreimage: u64 = 2;
    /// const ETooEarlyToRefud: u64 = 3;

    #[allow(lint(coin_field))]
    public struct Swap<phantom T> has key {
        id: UID,
        sender: address,
        recipient: address,
        coin: Coin<T>,
        hashlock: vector<u8>,
        timelock: u64,
        claimed: bool
    }

    /// Initialize a new HTLC swap by locking a coin with a hashlock and timelock
    #[allow(lint(self_transfer))]
    public fun init_swap<T>(
        recipient: address,
        mut coin: Coin<T>,
        amount: u64,
        hashlock: vector<u8>,
        timelock: u64,
        ctx: &mut TxContext
    ): () {
        let uid = new(ctx);
        let sender_addr = sender(ctx);
        assert!(sui::coin::value(&coin) >= amount, EInsufficientAmount);
        let swap = Swap {
            id: uid,
            sender: sender_addr,
            recipient,
            coin: sui::coin::split(&mut coin, amount, ctx),
            hashlock,
            timelock,
            claimed: false
        };

        transfer::share_object(swap);
        transfer::public_transfer(coin, sender_addr);
    }

    /// Claim the locked token if the correct secret is provided
    public fun claim<T>(
        swap: Swap<T>,
        recipient: address,
        secret: vector<u8>,
    ): Coin<T> {
        // Ensure the swap has not been claimed yet
        assert!(!swap.claimed, 100);

        // Ensure the caller is the intended recipient
        assert!(swap.recipient == recipient, 101);

        // Compute the hash of the provided secret
        let computed_hash: vector<u8> = hash::sha2_256(secret);

        // Ensure the hash matches the original hashlock
        assert!(computed_hash == swap.hashlock, 102);

        // Destructure swap to extract coin
        let Swap {
            id,
            sender: _sender,
            recipient: _recipient,
            coin: claimed_coin,
            hashlock: _hashlock,
            timelock: _timelock,
            claimed: _claimed
        } = move swap;

        delete(id);

        // Return the locked coin
        claimed_coin
    }

    /// Refund the locked token back to the sender if timelock has expired
    public fun refund<T>(
        swap: Swap<T>,
        clock: &Clock,
        ctx: &TxContext
    ): Coin<T> {
        let current_time = clock::timestamp_ms(clock) / 1000;
        let sender_addr = sender(ctx);

        assert!(!swap.claimed, 200);
        assert!(current_time >= swap.timelock, 201);
        assert!(sender_addr == swap.sender, 202);

        // Destructure and extract coin + consume UID
        let Swap {
            id,
            sender: _sender,
            recipient: _recipient,
            coin: refund_coin,
            hashlock: _hashlock,
            timelock: _timelock,
            claimed: _claimed
        } = move swap;

        // Explicitly delete UID to satisfy resource constraints
        delete(id);

        // Return the refunded coin
        refund_coin
    }
}