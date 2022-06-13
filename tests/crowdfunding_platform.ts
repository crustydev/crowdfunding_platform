import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { CrowdfundingPlatform } from "../target/types/crowdfunding_platform";

describe("crowdfunding_platform", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.CrowdfundingPlatform as Program<CrowdfundingPlatform>;

  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.methods.initialize().rpc();
    console.log("Your transaction signature", tx);
  });
});
