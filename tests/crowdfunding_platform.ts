import assert from "assert";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import * as spl from '@solana/spl-token'
import { getMinimumBalanceForRentExemptAccount, getMinimumBalanceForRentExemptMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { CrowdfundingPlatform } from "../target/types/crowdfunding_platform";
import { TokenAccountNotFoundError } from "@solana/spl-token";
import * as bs58 from "bs58"

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

    let [fundingWalletPDA, fundingWalletBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("funding-wallet")), fundstarter.publicKey.toBuffer()], program.programId
    );
    console.log("fundingwallet PDA is ", fundingWalletPDA);

    const createMint = async (connection: anchor.web3.Connection): Promise<anchor.web3.PublicKey> => {
      const tokenMint = anchor.web3.Keypair.generate();
      console.log(`tokenMint: ${tokenMint.publicKey.toBase58()}`);
      let tx = new anchor.web3.Transaction();

      console.log("did transaction fail?");

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

      console.log("did transaction to create an account fail?");

      const tx_signature = await provider.sendAndConfirm(tx, [tokenMint]);
      console.log(`[${tokenMint.publicKey}] created a new mint account at ${tx_signature}`);
      console.log("did signature verification pass?");

      return tokenMint.publicKey;
    }

    const readAccount = async (accountPubkey: anchor.web3.PublicKey, provider: anchor.Provider): Promise<[spl.RawAccount, string]> =>  {
      const tokenInfo = await provider.connection.getAccountInfo(accountPubkey);
      const data = Buffer.from(tokenInfo.data);
      const accountInfo: spl.RawAccount = spl.AccountLayout.decode(data);

      const amount = (accountInfo.amount as any as Buffer).readBigUInt64LE();
      return [accountInfo, amount.toString()];
    }

    console.log("Starting mint creation");
    let mintAddress = await createMint(provider.connection);
    console.log("Did mint creation fail?") 
    console.log("Mint address is: ", mintAddress);
    let expected_description = "Help fund my shopping habit";
    let expected_target = new anchor.BN(20);

    console.log("starting fundraiser...");
    await program.methods
      .startFundraiser(
        expected_description,
        expected_target,
        mintAddress
      )
      .accounts({
        fundStarter: fundstarter.publicKey,
        fundraiserState: statePDA,
        receivingWallet: fundingWalletPDA,
        tokenMint: mintAddress,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([fundstarter])
      .rpc();

    console.log(`Started new fundraiser to raise 20 tokens`);

    const fundraiserState = await program.account.fundraiser.fetch(statePDA);
      
    assert.equal(fundraiserState.fundStarter, fundstarter.publicKey);
    assert.equal(fundraiserState.receivingWallet, fundingWalletPDA);
    assert.equal(fundraiserState.description, expected_description);
    assert.equal(fundraiserState.target, expected_target);
    assert.equal(fundraiserState.balance, new anchor.BN(0));
    assert.equal(fundraiserState.tokenMint, mintAddress);
    assert.equal(fundraiserState.bump, stateBump);
    assert.equal(fundraiserState.status, 1);    

    const[, fundsWalletBalance] = await readAccount(fundingWalletPDA, provider);

    assert.equal(fundsWalletBalance, '0');
  });
});
