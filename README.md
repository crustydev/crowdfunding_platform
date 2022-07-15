# Solana crowdfunding contract
> ## Description
A smart contract that lets a user start a fundraiser and allows other users contribute to that fundraiser, kinda like gofundme :smiley:


> ## Requirements
- [Rust](https://www.rust-lang.org/tools/install)
- [Solana](https://docs.solana.com/cli/install-solana-cli-tools)
- [Yarn](https://yarnpkg.com/getting-started/install)
- [Anchor](https://book.anchor-lang.com/getting_started/installation.html)

View the full steps [here.](https://book.anchor-lang.com/getting_started/installation.html)

> ## Build and Testing
Deploy the contract to the devnet by following these steps on your cli:

- Navigate to your cli
- Run ```sh solana-keygen new``` to create a wallet keypair
- Run ```sh solana airdrop 2 ``` to airdrop sol to your wallet
- Clone the repo and change into its root directory
- Run ```sh anchor build``` to generate a new public key for your program
- Run ```sh anchor keys list``` .Copy the new pubkey into your declare_id!
macro at the top of `lib.rs` and replace the default key in `Anchor.toml`
- Change the `provider.cluster` variable in `Anchor.toml` to `devnet`
- Run ```sh anchor deploy```
- Run ```sh anchor run test```





