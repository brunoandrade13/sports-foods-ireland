# SFI Testing Documentation

## Test Suite Overview

This directory contains the automated test suite for Sports Foods Ireland (SFI) e-commerce platform.

### Structure

```
tests/
  └── unit/
      ├── cart.test.js      - Cart functionality tests
      └── checkout.test.js  - Checkout and payment tests
```

## Setup Instructions

### Installing Test Dependencies

Due to npm cache permission issues, you may need to manually fix npm cache before installing:

```bash
# Fix npm cache permissions (if needed)
sudo chown -R $(whoami) ~/.npm

# Install test dependencies
npm install --save-dev jest @jest/globals jsdom
```

Alternatively, use:

```bash
npm install --save-dev jest @jest/globals jsdom --force
```

### Running Tests

```bash
# Run all tests with coverage
npm test

# Run tests without coverage
npx jest

# Run specific test file
npx jest tests/unit/cart.test.js

# Run in watch mode (re-run on file changes)
npx jest --watch
```

## Test Coverage

### Cart Tests (`cart.test.js`)

Tests for cart data management and operations:

- **localStorage Management**
  - Validates localStorage key is `sfi_cart` (not `cart`)
  - Tests cart retrieval and storage
  - Handles corrupted data gracefully

- **Add to Cart**
  - Adds items with default and custom quantities
  - Increases quantity for existing items
  - Supports multiple products
  - Handles custom product data

- **Remove from Cart**
  - Removes items correctly
  - Handles non-existent products
  - Works with empty cart

- **Cart Calculations**
  - Empty cart returns 0
  - Single and multiple item totals
  - Handles mixed quantities
  - Validates price calculations

- **Edge Cases**
  - Zero-price products
  - Large quantities
  - Invalid localStorage data

### Checkout Tests (`checkout.test.js`)

Tests for checkout flow, coupons, and price calculations:

- **Cart Validation**
  - Rejects empty cart
  - Allows non-empty cart to proceed

- **Coupon Validation**
  - Valid percentage coupons (e.g., 20% off)
  - Valid fixed amount coupons (e.g., €10 off)
  - Expired coupons rejected
  - Minimum order requirements enforced
  - Usage limits validated
  - Free shipping coupons

- **Price Calculations**
  - Subtotal with single and multiple items
  - Percentage discount application
  - Fixed amount discount application
  - Tax calculation (23% VAT included)

- **Shipping Calculations**
  - Free shipping for regular customers over €60
  - Shipping cost €9.04 under threshold
  - B2B free shipping over €150
  - B2B shipping cost under €150

- **Edge Cases**
  - Zero-priced items
  - Very large orders
  - 100% discount coupons
  - Combined coupon + free shipping

## Key Testing Decisions

### Why These Tests?

1. **localStorage Key Validation**: Critical to prevent cart data conflicts with other systems
2. **Coupon Logic**: Complex business rules that must be validated
3. **Shipping Thresholds**: Different for B2B (€150) vs regular (€60) customers
4. **Price Calculations**: Financial accuracy is paramount

### Mocking Strategy

- **localStorage**: Mocked in-memory for fast, isolated tests
- **fetch**: Mocked for Supabase API calls to avoid external dependencies
- **DOM**: Minimal mocking as these are unit tests, not integration tests

## Coverage Goals

Target coverage thresholds (configured in `jest.config.js`):

- Branches: 50%
- Functions: 50%
- Lines: 50%
- Statements: 50%

These are starting targets and should be increased as the test suite matures.

## Future Test Additions

Recommended areas for expansion:

1. **Integration Tests**
   - Full checkout flow with test containers
   - Supabase database integration tests
   - PayPal/Stripe mock integrations

2. **E2E Tests**
   - User journey: Browse → Add to cart → Checkout → Payment
   - Mobile vs desktop flows
   - B2B vs B2C customer journeys

3. **Performance Tests**
   - Cart operations with large product catalogs
   - Checkout with high concurrent users
   - Database query performance

4. **Visual Regression Tests**
   - Cart modal rendering
   - Checkout page layout
   - Payment method selection

## Troubleshooting

### Tests Not Running

If you see "No tests found":

```bash
# Verify test files exist
ls -la tests/unit/

# Check Jest can find tests
npx jest --listTests
```

### Module Import Errors

If you see "Cannot use import statement":

- Ensure `package.json` has `"type": "module"`
- Check `jest.config.js` is properly configured
- Verify `@jest/globals` is installed

### Coverage Not Generating

```bash
# Force coverage generation
npx jest --coverage --collectCoverageFrom='js/**/*.js'

# View coverage report
open coverage/index.html
```

## CI/CD Integration

To integrate these tests into GitHub Actions or other CI/CD:

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test
```

## Contact

For questions about testing strategy or to report issues:

- Email: info@sportsfoodsireland.ie
- Developer: Test Agent 3 - SFI Testing Engineer

---

**Last Updated**: 2026-04-04
**Test Framework**: Jest 29.x with jsdom
**Node Version**: 18+ recommended
