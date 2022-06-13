use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount, Transfer};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

const DISCRIMINATOR_LEN: usize = 8;
const MAX_DESCRIPTION_LEN: usize = 200;

const PUBKEY_LEN: usize = 32;
const STRING_LEN: usize = MAX_DESCRIPTION_LEN + 4;
const UNSIGNED_64_LEN: usize = 8;

#[error_code]
pub enum CrowdFundError {
    #[msg("Target set for fund-raising must be greater than 0")]
    InvalidTarget,
    #[msg("Maxed out space for fund-raiser description")]
    DescriptionTooLong,
    #[msg("Invalid fundraiser state")]
    InvalidState,
}

#[program]
pub mod crowdfunding_platform {
    use super::*;

    pub fn start_fundraiser(
        ctx: Context<StartFundraiser>,
        description: String,
        target: u64,
        token_mint: Pubkey,
    ) -> Result<()> {
        require!(target > 0, CrowdFundError::InvalidTarget);
        let state = &mut ctx.accounts.fundraiser;

        state.authority = ctx.accounts.authority.key();
        require!(
            description.chars().count() <= MAX_DESCRIPTION_LEN,
            CrowdFundError::DescriptionTooLong
        );
        state.funding_wallet = ctx.accounts.funding_wallet.key();
        state.description = description;
        state.target = target;
        state.balance = 0;
        state.token_mint = token_mint;
        state.bump = *ctx.bumps.get("fundraiser").unwrap();
        state.state = 1;
        Ok(())
    }
}


#[derive(Accounts)]
pub struct StartFundraiser<'info> {
    #[account(mut)]
    authority: Signer<'info>,
    #[account(
        init, seeds = [b"fundraiser".as_ref()],
        bump, payer = authority, space = Fundraiser::LEN
    )]
    fundraiser: Account<'info, Fundraiser>,

    #[account(
        init,
        seeds = [b"funding-wallet".as_ref()], bump,
        payer = authority,
        token::mint = token_mint,
        token::authority = authority
    )]
    funding_wallet: Account<'info, TokenAccount>,

    token_mint: Account<'info, Mint>,

    system_program: Program<'info, System>,
    token_program: Program<'info, Token>,
    rent: Sysvar<'info, Rent>,
}


#[account]
pub struct Test {
    test: u64,
}

#[account]
pub struct Fundraiser {
    // The user starting a fundraiser
    authority: Pubkey,

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

    bump: u8,

    state: u8,
}

impl Fundraiser {
    const LEN: usize = (PUBKEY_LEN * 3) + STRING_LEN + (UNSIGNED_64_LEN * 2);
}

#[derive(Clone, Copy, PartialEq, AnchorDeserialize, AnchorSerialize)]
pub enum State {
    AccountEmpty,
    TargetPending,
    TargetMade,
}

impl State {
    fn from(val: u8) -> std::result::Result<State, CrowdFundError> {
        match val {
            1 => Ok(State::AccountEmpty),
            2 => Ok(State::TargetPending),
            3 => Ok(State::TargetMade),
            invalid_number => {
                msg!("Invalid state: {}", invalid_number);
                Err(CrowdFundError::InvalidState)
            }
        }
    }

    fn to_u8(&self) -> u8 {
        match self {
            State::AccountEmpty => 1,
            State::TargetPending => 2,
            State::TargetMade => 3,
        }
    }
}
