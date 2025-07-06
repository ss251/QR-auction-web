# Auction Data Table Formulas - Admin Dashboard Claims Tab

## Overview

The auction data table in the admin dashboard claims tab displays comprehensive analytics for QR auctions, including claim counts, expenses, and cost calculations. This document explains the formulas and calculations used to generate the data.

## Main Data Sources

The auction data table pulls data from multiple sources:

1. **`winners` table** - Contains auction winning bid amounts in USD
2. **`link_visit_claims` table** - Contains claim data including amounts, sources, and user scores
3. **`historical_qr_prices` table** - Contains QR token price data for specific auctions
4. **DexScreener API** - Real-time QR price data as fallback

## Key Formulas and Calculations

### 1. Cost Per Claim Formula

The primary formula used in the claims analytics is:

```
cost_per_claim = (winning_bid_usd / total_claims) - qr_reward_value_usd
```

Where:
- `winning_bid_usd` = USD value of the winning auction bid
- `total_claims` = Total number of successful claims for the auction
- `qr_reward_value_usd` = Average QR reward per claim × QR price in USD

### 2. QR Reward Value Calculation

```
qr_reward_value_usd = qr_reward_per_claim × qr_price_usd
```

Where:
- `qr_reward_per_claim` = Total QR distributed / Number of successful claims
- `qr_price_usd` = Historical QR price for the auction (from `historical_qr_prices` table or DexScreener API)

### 3. Cost Per Click Formula

```
cost_per_click = winning_bid_usd / total_claims
```

This represents the raw cost per claim before accounting for QR rewards.

### 4. Auction Expenses Calculation

For the "Claim Expenses by Auction" chart:

```
total_expense_usd = total_qr_distributed × qr_price_usd
```

Where:
- `total_qr_distributed` = Sum of all QR amounts distributed in successful claims
- `qr_price_usd` = Auction-specific QR price (from overrides or historical data)

## Data Aggregation Logic

### Claim Counting

Claims are aggregated by:
- **Total Claims**: All successful claims (`success = true`)
- **Web Claims**: Claims from `claim_source = 'web'` or `'mobile'`
- **Mini-App Claims**: Claims from `claim_source = 'mini_app'`

### Spam Detection (Mini-App Only)

For mini-app claims:
- **Valid Claims**: `spam_label = false`
- **Spam Claims**: `spam_label = true`
- **Unlabeled Claims**: `spam_label = null` (not counted as spam or valid)

### Neynar Score Distribution

Mini-app claims are categorized by user score:
- **0-20%**: `neynar_user_score < 0.2`
- **20-40%**: `0.2 ≤ neynar_user_score < 0.4`
- **40-60%**: `0.4 ≤ neynar_user_score < 0.6`
- **60-80%**: `0.6 ≤ neynar_user_score < 0.8`
- **80-100%**: `neynar_user_score ≥ 0.8`
- **Unknown**: `neynar_user_score = null`

## Reward Tier Breakdown

### Current Auctions (ID > 118)

- **Web Claims**:
  - 100 QR rewards
  - 500 QR rewards
- **Mini-App Claims**:
  - 100 QR rewards
  - 1000 QR rewards

### Legacy Auctions (ID ≤ 118)

Legacy auctions had different reward structures:
- 420 QR rewards
- 1000 QR rewards
- 2000 QR rewards
- 5000 QR rewards
- Plus standard 100 QR and 500 QR rewards

## QR Price Determination

The system uses a hierarchical approach for QR prices:

1. **Override Prices**: From cost-per-claim data (`qrPriceOverrides`)
2. **Historical Prices**: From `historical_qr_prices` table
3. **Real-time Price**: From DexScreener API
4. **Fallback Price**: $0.01 USD

## Chart Data Processing

### Claim Count Chart

Shows stacked bar chart with:
- Web claims (blue)
- Mini-app claims (green)
- Total count displayed on top of bars

### Claim Expenses Chart

Shows total USD expenses per auction:
```
bar_value = total_qr_distributed × auction_specific_qr_price
```

### Reward Tier Breakdown Chart

Stacked bar chart showing distribution of different reward amounts per auction, with different colors for each tier and source combination.

## Data Filtering

- **Minimum Auction ID**: Only auctions ≥ 71 are displayed (when claims started)
- **Minimum Claims**: Only auctions with `click_count > 0` are shown
- **Sorting**: Data is sorted by auction ID in ascending order

## Statistical Calculations

### Summary Statistics

- **Total Auctions**: Count of all auctions with data
- **Auctions with Claims**: Count of auctions with `click_count > 0`
- **Total Claims**: Sum of all claim counts
- **Total USD Value**: Sum of all winning bid values
- **Average Cost per Claim**: Total USD spent / Total claims - Average QR reward value

## Error Handling

The system includes fallback mechanisms:
- Default QR price if API calls fail
- Empty data handling for missing records
- Authorization checks for admin-only access

## Data Freshness

- **Real-time**: QR prices from DexScreener API
- **Near real-time**: Claim data from database
- **Historical**: Winning bid data and historical prices
- **Cacheable**: API responses are cached for 5-10 minutes

This comprehensive formula system provides administrators with detailed insights into auction performance, claim economics, and reward distribution across different user segments and platforms.