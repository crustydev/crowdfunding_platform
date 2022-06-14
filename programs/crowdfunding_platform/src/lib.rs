use anchor_lang::prelude::*;
use anchor_spl::token::{CloseAccount, Mint, Token, TokenAccount, Transfer};

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
    #[msg("Invalid fundraiser status")]
    InvalidStatus,
    #[msg("You tried to donate to a closed fundraiser")]
    ClosedToDonations,
    #[msg("State balance does not correlate with wallet balance")]
    ErroneousBalance,
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
        let fundraiser = &mut ctx.accounts.fundraiser_state;

        fundraiser.fund_starter = ctx.accounts.fund_starter.key();
        require!(
            description.chars().count() <= MAX_DESCRIPTION_LEN,
            CrowdFundError::DescriptionTooLong
        );
        fundraiser.receiving_wallet = ctx.accounts.receiving_wallet.key();
        fundraiser.description = description;
        fundraiser.target = target;
        fundraiser.balance = 0;
        fundraiser.token_mint = token_mint;
        fundraiser.bump = *ctx.bumps.get("fundraiser").unwrap();
        fundraiser.status = Status::DonationsOpen.to_u8();
        Ok(())
    }

    pub fn donate(ctx: Context<Donate>, amount: u64) -> Result<()> {
        let current_status = Status::from(ctx.accounts.fundraiser_state.status)?;
        if current_status == Status::DonationsClosed || current_status == Status::CampaignEnded {
            msg!("This fundraising campaign is closed to Donations");
            return Err(CrowdFundError::ClosedToDonations.into());
        }

        if current_status != Status::DonationsOpen {
            msg!("Invalid status");
            return Err(CrowdFundError::InvalidStatus.into());
        }

        let fundraiser_state = &mut ctx.accounts.fundraiser_state;

        let donating_wallet = ctx.accounts.donator_wallet.to_owned();
        let receiving_wallet = &mut ctx.accounts.receiving_wallet.to_owned();
        let donator = ctx.accounts.donator.to_owned();
        let token_program = ctx.accounts.token_program.to_owned();
        let token_amount = amount;

        let transfer_instruction = Transfer {
            from: donating_wallet.to_account_info(),
            to: receiving_wallet.to_account_info(),
            authority: donator.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(token_program.to_account_info(), transfer_instruction);

        anchor_spl::token::transfer(cpi_ctx, token_amount)?;
        _ = fundraiser_state.balance.checked_add(amount);

        receiving_wallet.reload()?;
        assert_eq!(
            fundraiser_state.balance, receiving_wallet.amount
        );

        if fundraiser_state.balance >= fundraiser_state.target {
            msg!("Fundraiser goal met!");
            _ = fundraiser_state.status == Status::DonationsClosed.to_u8();
        }

        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        let fundraiser_state = &mut ctx.accounts.fundraiser_state;
        if Status::from(fundraiser_state.status)? != Status::CampaignEnded {
            fundraiser_state.status = Status::CampaignEnded.to_u8();
        }

        let fund_starter = ctx.accounts.fund_starter.to_owned();
        let funds_pot = &mut ctx.accounts.receiving_wallet.to_owned();
        let destination_account = ctx.accounts.wallet_to_withdraw_to.to_owned();
        let token_program = ctx.accounts.token_program.to_owned();

        // We reload to get the amount of tokens in our pot and withdraw all of it
        funds_pot.reload()?;
        let amount_to_withdraw = funds_pot.amount;

        let transfer_instruction = Transfer {
            from: funds_pot.to_account_info(),
            to: destination_account.to_account_info(),
            authority: fund_starter.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(token_program.to_account_info(), transfer_instruction);
        anchor_spl::token::transfer(cpi_ctx, amount_to_withdraw)?;

        let should_close = {
            funds_pot.reload()?;
            funds_pot.amount == 0
        };

        if should_close {
            let close_instruction = CloseAccount {
                account: funds_pot.to_account_info(),
                destination: fund_starter.to_account_info(),
                authority: fund_starter.to_account_info(),
            };
            let cpi_ctx = CpiContext::new(token_program.to_account_info(), close_instruction);
            anchor_spl::token::close_account(cpi_ctx)?;
        }

        Ok(())
    }
}

#[derive(Accounts)]
pub struct StartFundraiser<'info> {
    #[account(mut)]
    fund_starter: Signer<'info>,
    #[account(
        init, seeds = [b"fundraiser".as_ref(), fund_starter.key().as_ref()],
        bump, payer = fund_starter, space = Fundraiser::LEN
    )]
    fundraiser_state: Account<'info, Fundraiser>,

    #[account(
        init,
        seeds = [b"funding-wallet".as_ref(), fund_starter.key().as_ref()], bump,
        payer = fund_starter,
        token::mint = token_mint,
        token::authority = fund_starter
    )]
    receiving_wallet: Account<'info, TokenAccount>,

    token_mint: Account<'info, Mint>,

    system_program: Program<'info, System>,
    token_program: Program<'info, Token>,
    rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Donate<'info> {
    #[account(
        mut,
        seeds=[b"fundraiser".as_ref(), fund_starter.key().as_ref()],
        bump,
        has_one = fund_starter,
        has_one = token_mint,
    )]
    fundraiser_state: Account<'info, Fundraiser>,

    #[account(
        mut,
        seeds=[b"funding-wallet".as_ref(), fund_starter.key().as_ref()],
        bump
    )]
    receiving_wallet: Account<'info, TokenAccount>,

    #[account(mut)]
    donator: Signer<'info>,
    /// CHECK: we do not read or write to or from this account
    fund_starter: AccountInfo<'info>,
    token_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint=donator_wallet.mint == token_mint.key(),
        constraint=donator_wallet.owner == donator.key()
    )]
    donator_wallet: Account<'info, TokenAccount>,

    system_program: Program<'info, System>,
    token_program: Program<'info, Token>,
    rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds=[b"fundraiser".as_ref(), fund_starter.key().as_ref()],
        bump,
        has_one = fund_starter,
        has_one = token_mint,
    )]
    fundraiser_state: Account<'info, Fundraiser>,

    #[account(
        mut,
        seeds=[b"funding-wallet".as_ref(), fund_starter.key().as_ref()],
        bump
    )]
    receiving_wallet: Account<'info, TokenAccount>,

    fund_starter: Signer<'info>,
    token_mint: Account<'info, Mint>,

    system_program: Program<'info, System>,
    token_program: Program<'info, Token>,
    rent: Sysvar<'info, Rent>,

    #[account(
        mut,
        constraint=wallet_to_withdraw_to.mint == token_mint.key(),
        constraint=wallet_to_withdraw_to.owner == fund_starter.key()
    )]
    wallet_to_withdraw_to: Account<'info, TokenAccount>,
}

#[account]
pub struct Fundraiser {
    // The user starting a fundraiser
    fund_starter: Pubkey,

    // The wallet that'll receive the tokens
    receiving_wallet: Pubkey,

    // The fundraiser description, should not take > 200 bytes of storage
    description: String,

    // The amount of tokens the user is trying to raise
    target: u64,

    // The current balance of the user's fundraising account
    balance: u64,

    // The mint of the token the user is trying to raise
    token_mint: Pubkey,

    bump: u8,

    status: u8,
}

impl Fundraiser {
    const LEN: usize = (PUBKEY_LEN * 3) + STRING_LEN + (UNSIGNED_64_LEN * 2) + DISCRIMINATOR_LEN;
}

#[derive(Clone, Copy, PartialEq, AnchorDeserialize, AnchorSerialize)]
pub enum Status {
    DonationsOpen,
    DonationsClosed,
    CampaignEnded,
}

impl Status {
    fn from(val: u8) -> std::result::Result<Status, CrowdFundError> {
        match val {
            1 => Ok(Status::DonationsOpen),
            2 => Ok(Status::DonationsClosed),
            3 => Ok(Status::CampaignEnded),
            invalid_number => {
                msg!("Invalid state: {}", invalid_number);
                Err(CrowdFundError::InvalidStatus)
            }
        }
    }

    fn to_u8(&self) -> u8 {
        match self {
            Status::DonationsOpen => 1,
            Status::DonationsClosed => 2,
            Status::CampaignEnded => 3,
        }
    }
}
