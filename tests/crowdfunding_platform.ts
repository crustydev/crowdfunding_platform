import assert from "assert";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import * as spl from '@solana/spl-token'
import { getMinimumBalanceForRentExemptAccount, getMinimumBalanceForRentExemptMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { CrowdfundingPlatform } from "../target/types/crowdfunding_platform";
import { TokenAccountNotFoundError } from "@solana/spl-token";
import { expect } from 'chai';


describe("crowdfunding_platform", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.CrowdfundingPlatform as Program<CrowdfundingPlatform>;

  it("Starts a fundraising campaign", async () => {

    const connection = provider.connection;
    const fundstarter = anchor.web3.Keypair.generate();
    const airdropSignature = await connection.requestAirdrop(fundstarter.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    const latestBlockHash = await connection.getLatestBlockhash();

    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSignature,
    });

    let [statePDA, stateBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("fundraiser")), fundstarter.publicKey.toBuffer()], program.programId
    );
    console.log("state PDA is ", statePDA);

    let [receivingWalletPDA, receivingWalletBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("funding-wallet")), fundstarter.publicKey.toBuffer()], program.programId
    );
    console.log("fundingwallet PDA is ", receivingWalletPDA);

    const createMint = async (connection: anchor.web3.Connection): Promise<anchor.web3.PublicKey> => {
      const tokenMint = anchor.web3.Keypair.generate();
      console.log(`tokenMint: ${tokenMint.publicKey.toBase58()}`);
      let tx = new anchor.web3.Transaction();

      tx.add(
        // create mint account
        anchor.web3.SystemProgram.createAccount({
          fromPubkey: provider.wallet.publicKey,
          newAccountPubkey: tokenMint.publicKey,
          space: spl.MINT_SIZE,
          lamports: await getMinimumBalanceForRentExemptMint(connection),
          programId: spl.TOKEN_PROGRAM_ID,
        }),
        // init mint account
          spl.createInitializeMintInstruction(
          tokenMint.publicKey,
          8,
          provider.wallet.publicKey,
          provider.wallet.publicKey,
          )
      );

      const tx_signature = await provider.sendAndConfirm(tx, [tokenMint]);
      console.log(`[${tokenMint.publicKey}] created a new mint account at ${tx_signature}`);

      return tokenMint.publicKey;
    }

    let mintAddress = await createMint(provider.connection);
    console.log("Mint address is: ", mintAddress);

    let expected_description = "Help fund my spending habit";
    let expected_target = new anchor.BN(20);

    console.log("Starting fundraiser...");
    await program.methods
      .startFundraiser(
        expected_description,
        expected_target,
        mintAddress
      )
      .accounts({
        fundStarter: fundstarter.publicKey,
        fundraiserState: statePDA,
        receivingWallet: receivingWalletPDA,
        tokenMint: mintAddress,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([fundstarter])
      .rpc();

    console.log(`Started new fundraiser to raise ${expected_target} tokens`);

    const state = await program.account.fundraiser.fetch(statePDA);
    let tokenAccountBalance = await provider.connection.getTokenAccountBalance(receivingWalletPDA);
      
    assert.equal(state.balance.toNumber(), new anchor.BN(0));
    assert.equal(state.target.toNumber(), expected_target);
    assert.equal(state.description.toString(), expected_description);
    assert.ok(state.tokenMint.equals(mintAddress));
    assert.ok(state.fundStarter.equals(fundstarter.publicKey));
    assert.ok(state.receivingWallet.equals(receivingWalletPDA));
    assert.equal(state.status, new anchor.BN(1));
    assert.equal(state.balance.toNumber(),tokenAccountBalance.value.uiAmount);
  });
});
