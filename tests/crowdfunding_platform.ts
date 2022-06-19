import * as anchor from '@project-serum/anchor';
import { AnchorError, Program } from '@project-serum/anchor';
import * as spl from '@solana/spl-token';
import { CrowdfundingPlatform } from '../target/types/crowdfunding_platform';
import assert from 'assert';
import chai from 'chai';
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
  
    let xx = await spl.mintToChecked(
      connection,
      mintAuthority,
      mintAddress,
      donatorWallet,
      mintAuthority,
      donatorBalance * 1e0,
      0
    );
    
    const initialDonatorWalletBalance = await (await connection.getTokenAccountBalance(donatorWallet)).value.uiAmount;
    const initialReceivingWalletBalance = await (await connection.getTokenAccountBalance(state.receivingWallet)).value.uiAmount;
  
    let donationSize = donation;
  
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
    
    console.log(`${donationSize} tokens donated`);
  
    const donatorWalletBalance = (await connection.getTokenAccountBalance(donatorWallet)).value.uiAmount;
    const receivingWalletBalance = (await connection.getTokenAccountBalance(state.receivingWallet)).value.uiAmount;
  
    const fundraiser = await program.account.fundraiser.fetch(statePDA);
  
    console.log("Fundraiser balance is ", fundraiser.balance.toNumber());
  
    assert.equal(donatorWalletBalance, initialDonatorWalletBalance - donationSize);
    assert.equal(receivingWalletBalance, initialReceivingWalletBalance + donationSize);
    assert.equal(fundraiser.balance.toNumber(), receivingWalletBalance);

  
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
  
    const mintAuthorityBalance = await connection.getBalance(mintAuthority.publicKey);
  
    let mintAddress = await spl.createMint(
      connection,
      mintAuthority,
      mintAuthority.publicKey,
      null,
      0
    );
    console.log(`Mint account created with address: ${mintAddress.toBase58()}`);
  
    return [mintAddress, mintAuthority];
  }





describe('crowdfunding_platform', () => {

  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.CrowdfundingPlatform as Program<CrowdfundingPlatform>;
  const fundstarter = anchor.web3.Keypair.generate();

  let statePDA: anchor.web3.PublicKey;
  let stateBump: number;
  let receivingWalletPDA: anchor.web3.PublicKey;
  let receivingWalletBump: number;
  let mintAddress: anchor.web3.PublicKey;
  let mintAuthority: anchor.web3.Keypair;


  it("Starts a fundraising campaign", async () => {

    // Airdrop sol to pay for transactions
    const connection = provider.connection;
    const airdropSignature = await connection.requestAirdrop(fundstarter.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    const latestBlockHash = await connection.getLatestBlockhash();

    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSignature,
    });

    [statePDA, stateBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("fundraiser")), fundstarter.publicKey.toBuffer()], program.programId
    );

    [receivingWalletPDA, receivingWalletBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("funding-wallet")), fundstarter.publicKey.toBuffer()], program.programId
    );

    [mintAddress, mintAuthority] = await createTokenMint(provider.connection);

  // Assert that an attempt to set description with length > 200 fails
    try {
      let expected_description = "Help fund my spending habit. I'm going on and on right now to max out the description length. Howdy. Howdy. Howdy. Howdy. Ahhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh";
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
        chai.assert(false, "should've failed due to maxed out description length");
    } catch (_err) {
      expect(_err).to.be.instanceOf(AnchorError);
      const err: AnchorError = _err;
      expect(err.error.errorCode.code).to.equal("DescriptionTooLong");
      expect(err.error.errorCode.number).to.equal(6001);
      expect(err.program.equals(program.programId)).is.true;
    }

    // Assert that an attempt to start a fundraiser with target < 0 fails
    try {
      let expected_description = "Help fund my spending habit. I'm going on and on right now to max out the description length. Howdy. Howdy. Howdy. Howdy. Ahhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh";
      let expected_target = new anchor.BN(0);
  
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
    } catch (_err) {
      expect(_err).to.be.instanceOf(AnchorError);
      const err: AnchorError = _err;
      expect(err.error.errorCode.code).to.equal("InvalidTarget");
      expect(err.error.errorCode.number).to.equal(6000);
      expect(err.program.equals(program.programId)).is.true;
    }

    // Start a fundraiser with valid parameters
    let expected_description = "Help fund my spending habit";
    let expected_target = new anchor.BN(100);

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


  it('simulates donations to a crowdfunding campaign', async () => {

    await donate(
      program,
      20,
      100, 
      mintAddress, 
      mintAuthority, 
      statePDA
    );

    await donate(
      program, 
      50, 
      51, 
      mintAddress, 
      mintAuthority, 
      statePDA
    );
    
    await donate(
      program, 
      100, 
      350, 
      mintAddress, 
      mintAuthority, 
      statePDA
    );

    try {
      await donate(
        program, 
        20, 
        50, 
        mintAddress, 
        mintAuthority, 
        statePDA
        );
        chai.assert(false, "should've failed due to fundraiser being closed");
    } catch(_err) {
      expect(_err).to.be.instanceOf(AnchorError);
      const err: AnchorError = _err;
      expect(err.error.errorCode.number).to.equal(6003);
      expect(err.error.errorCode.code).to.equal("ClosedToDonations");
    }
    
  });
});
