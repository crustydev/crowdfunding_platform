use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod crowdfunding_platform {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}


#[account]
#[derive(Default)]
pub struct CrowdFundState {
    // The user starting a fundraiser
    user: Pubkey,

    // The wallet that'll receive the tokens
    funding_wallet: Pubkey,

    // The fundraiser description, should not take > 200 bytes of storage
    description: String,

    // The amount of tokens the user is trying to raise
    target: u64,

    // The current balance of the user's fundraising account
    balance: u64,

    // The mint of the token the user is trying to raise
    token_mint: Pubkey,
}