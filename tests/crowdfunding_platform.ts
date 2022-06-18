import assert from "assert";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import * as spl from '@solana/spl-token'
import { createAssociatedTokenAccount, DecodedSyncNativeInstruction, getAccount, getMinimumBalanceForRentExemptAccount, getMinimumBalanceForRentExemptMint, getMint, mintTo, mintToChecked, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { CrowdfundingPlatform } from "../target/types/crowdfunding_platform";
import { TokenAccountNotFoundError } from "@solana/spl-token";
import { expect } from 'chai';



async function donate(program: Program<CrowdfundingPlatform>, donation, donatorBalance, mintAddress, mintAuthority, statePDA) {
  const donator = anchor.web3.Keypair.generate();
  const connection = program.provider.connection;
  const state = await program.account.fundraiser.fetch(statePDA);
  
  const donatorWallet = await spl.createAssociatedTokenAccount(
    connection,
    mintAuthority,
    mintAddress,
    donator.publicKey  
  );
  console.log(`\n\n\nDonator ATA created: ${donatorWallet.toBase58()}`);
  console.log(`ATA balance before minting: ${await (await connection.getTokenAccountBalance(donatorWallet)).value.uiAmount}`);

  let xx = await spl.mintToChecked(
    connection,
    mintAuthority,
    mintAddress,
    donatorWallet,
    mintAuthority,
    donatorBalance * 1e0,
    0
  );
  console.log(`Tokens minted: ${xx}`);
  const initialDonatorBalance = await (await connection.getTokenAccountBalance(donatorWallet)).value.uiAmount;
  console.log(`Donator ATA balance after minting: ${initialDonatorBalance}`);


  console.log("Initial donator wallet balance is ", initialDonatorBalance);
  const initialReceivingWalletBalance = await (await connection.getTokenAccountBalance(state.receivingWallet)).value.uiAmount;
  console.log("Initial destination wallet balance is ", initialReceivingWalletBalance);

  let donationSize = donation;

  console.log(`\nDonating ${donationSize} tokens...\n`);

  await program.methods
    .donate(new anchor.BN(donationSize))
    .accounts({
      fundraiserState: statePDA,
      receivingWallet: state.receivingWallet,
      donator: donator.publicKey,
      fundStarter: state.fundStarter,
      tokenMint: mintAddress,
      donatorWallet: donatorWallet,
      systemProgram: anchor.web3.SystemProgram.programId,
      tokenProgram: spl.TOKEN_PROGRAM_ID,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .signers([donator])
    .rpc();

  const donatorWalletBalance = (await connection.getTokenAccountBalance(donatorWallet)).value.uiAmount;
  console.log("Donator wallet balance after donation is ", donatorWalletBalance);

  const receivingWalletBalance = (await connection.getTokenAccountBalance(state.receivingWallet)).value.uiAmount;
  console.log("Destination wallet balance after donation is ", receivingWalletBalance);
  console.log("donationSize is ", donationSize);

  const fundraiser = await program.account.fundraiser.fetch(statePDA);

  console.log("Fundraiser balance is ", fundraiser.balance.toNumber());

  assert.equal(donatorWalletBalance, initialDonatorBalance - donationSize);
  assert.equal(receivingWalletBalance, initialReceivingWalletBalance + donationSize);
  assert.equal(fundraiser.balance.toNumber(), receivingWalletBalance);

  console.log("Fundraiser status is ", fundraiser.status);

  if(fundraiser.balance.toNumber() < fundraiser.target.toNumber()) {
    assert.ok(fundraiser.status == 1);
  } else {
    assert.ok(fundraiser.status == 2);
  }  
}


async function createTokenMint(connection: anchor.web3.Connection): Promise<[anchor.web3.PublicKey, anchor.web3.Keypair]> {
  let mintAuthority = anchor.web3.Keypair.generate();
  const airdropSignature3 = await connection.requestAirdrop(mintAuthority.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
  const latestBlockHash3 = await connection.getLatestBlockhash();
  const mintAirdropTx = await connection.confirmTransaction({
    blockhash: latestBlockHash3.blockhash,
    lastValidBlockHeight: latestBlockHash3.lastValidBlockHeight,
    signature: airdropSignature3,
  });

  console.log("airdrop complete");
  const mintAuthorityBalance = await connection.getBalance(mintAuthority.publicKey);
  console.log("mintAuthorityBalance is ", mintAuthorityBalance);

  let mintAddress = await spl.createMint(
    connection,
    mintAuthority,
    mintAuthority.publicKey,
    null,
    0
  );
  console.log(`Test mint created: ${mintAddress.toBase58()}`);

  return [mintAddress, mintAuthority];
}


describe("crowdfunding_platform", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.CrowdfundingPlatform as Program<CrowdfundingPlatform>;
  const fundstarter = anchor.web3.Keypair.generate();
 /*
  it("Starts a fundraising campaign", async () => {

    const connection = provider.connection;
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

    let [mintAddress, _] = await createTokenMint(provider.connection);
    console.log("Mint address is: ", mintAddress);

    let expected_description = "Help fund my spending habit";
    let expected_target = new anchor.BN(100);

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

  });*/


  it("Simulates a fundraising campaign", async () => {

    const connection = provider.connection;

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


    // create mint
    const [mintAddress, mintAuthority] = await createTokenMint(connection);

    let expected_description = "Help fund my spending habit";
    let expected_target = new anchor.BN(100);

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


/// Start making donations
    await donate(program, 20, 100, mintAddress, mintAuthority, statePDA);
    await donate(program, 50, 51, mintAddress, mintAuthority, statePDA);
    //await donate(program, 30, 10, mintAddress, mintAuthority, statePDA);
    await donate(program, 100, 350, mintAddress, mintAuthority, statePDA);
    await donate(program, 20, 50, mintAddress, mintAuthority, statePDA);


  });
});






