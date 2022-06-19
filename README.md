### Crowdfunding platform
A decentralized application that lets a user start a fundraiser and allows other users to contribute to that fundraiser.

### Prerequisites

1. Solana Tool Suite - You can see the installation instructions [here](https://docs.solana.com/cli/install-solana-cli-tools).

2. Anchor - You can find the installation instructions [here](https://project-serum.github.io/anchor/getting-started/installation.html).


### Build

You probably need to install Solana, Anchor and Rust to make it run.
If you haven't already, install those dependencies by following this tutorial :https://project-serum.github.io/anchor/getting-started/installation.html or the steps in the prerequisites section above.


When you are set up, clone the repo and run the tests using the following steps:

1. Change into the project directory you'd like to run

2. Fetch the project ID for the build:

```sh
solana address -k target/deploy/<programname>-keypair.json
```

3. Update the project ID in the Rust program located at __myepicproject/programs/src/lib.rs__ with the output from above.

4. Run the tests

```sh
anchor test
```
This builds the program, deploys it and then runs the tests.

5. If you need to you can airdrop solana to your address using:

```bash
solana airdrop 2 <YOURPUBKEY>
```




