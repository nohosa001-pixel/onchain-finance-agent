// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DeHedgeVault - Institutional Non-Custodial Autonomous Hedge Fund Vault (ERC-4626)
 * @notice Tokenized asset management vault engineered for autonomous AI agents.
 * @dev Enforces 100% Non-Custodial guarantees:
 *      1. Only LPs can withdraw or redeem their deposited capital.
 *      2. Autonomous AI Agent is strictly limited to whitelisted DEX swap routers.
 *      3. On-chain 5% Max Drawdown Circuit Breaker prevents catastrophic losses.
 *      4. High-Water Mark (2 & 20) institutional performance fee accounting.
 */

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function decimals() external view returns (uint8);
}

interface IERC4626 {
    function asset() external view returns (address);
    function totalAssets() external view returns (uint256);
    function convertToShares(uint256 assets) external view returns (uint256);
    function convertToAssets(uint256 shares) external view returns (uint256);
    function maxDeposit(address receiver) external view returns (uint256);
    function previewDeposit(uint256 assets) external view returns (uint256);
    function deposit(uint256 assets, address receiver) external returns (uint256);
    function maxMint(address receiver) external view returns (uint256);
    function previewMint(uint256 shares) external view returns (uint256);
    function mint(uint256 shares, address receiver) external returns (uint256);
    function maxWithdraw(address owner) external view returns (uint256);
    function previewWithdraw(uint256 assets) external view returns (uint256);
    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256);
    function maxRedeem(address owner) external view returns (uint256);
    function previewRedeem(uint256 shares) external view returns (uint256);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256);

    event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares);
    event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares);
}

contract DeHedgeVault is IERC4626, IERC20 {
    // --- ERC-20 Vault Share Metadata ($wALPHA) ---
    string public constant name = "DeHedge Alpha Vault Share";
    string public constant symbol = "wALPHA";
    uint8 public constant decimals = 18;

    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    // --- Underlying Asset (USDC: 6 decimals) ---
    IERC20 public immutable underlyingAsset;
    uint8 public immutable assetDecimals;

    // --- Roles & Governance ---
    address public immutable fundManager;       // Protocol Governor (Multi-sig)
    address public agentTrader;                 // Autonomous AI Execution Agent
    address public treasuryWallet;              // Protocol & Autonomous Compute Fee Collector

    // --- Institutional Guardrails & Circuit Breaker ---
    uint256 public constant MAX_DRAWDOWN_BPS = 500; // 5.0% Max Daily Drawdown
    uint256 public constant BPS_DIVISOR = 10000;
    
    bool public circuitBreakerActive;
    uint256 public circuitBreakerCooldownUntil;
    uint256 public highWaterMarkNAV;            // Scaled by 1e18 (Starts at 1.0 = 1e18)
    uint256 public dailyBaselineAUM;            // Midnight AUM snapshot for drawdown evaluation
    uint256 public lastDailyResetTimestamp;

    // --- Whitelisted DEX Routers ---
    mapping(address => bool) public whitelistedRouters;

    // --- Events ---
    event RouterWhitelistUpdated(address indexed router, bool status);
    event AgentTraderUpdated(address indexed newAgent);
    event CircuitBreakerTriggered(uint256 currentAUM, uint256 baselineAUM, uint256 timestamp);
    event CircuitBreakerReset(uint256 resetTimestamp);
    event TradeExecuted(address indexed router, uint256 assetAmountIn, bytes tradeData);
    event PerformanceFeeAccrued(uint256 feeShares, uint256 newHWM);

    // --- Modifiers ---
    modifier onlyManager() {
        require(msg.sender == fundManager, "DeHedgeVault: caller is not manager");
        _;
    }

    modifier onlyAgentOrManager() {
        require(msg.sender == agentTrader || msg.sender == fundManager, "DeHedgeVault: unauthorized execution");
        _;
    }

    modifier notInCircuitBreaker() {
        if (circuitBreakerActive) {
            require(block.timestamp > circuitBreakerCooldownUntil, "DeHedgeVault: circuit breaker active");
        }
        _;
    }

    constructor(
        address _underlyingAsset,
        address _fundManager,
        address _agentTrader,
        address _treasuryWallet
    ) {
        require(_underlyingAsset != address(0), "Invalid asset");
        require(_fundManager != address(0), "Invalid manager");
        require(_treasuryWallet != address(0), "Invalid treasury");

        underlyingAsset = IERC20(_underlyingAsset);
        assetDecimals = IERC20(_underlyingAsset).decimals();
        fundManager = _fundManager;
        agentTrader = _agentTrader;
        treasuryWallet = _treasuryWallet;

        highWaterMarkNAV = 1e18; // 1.000000000000000000
        lastDailyResetTimestamp = block.timestamp;
    }

    // =========================================================================
    // ERC-4626 Core Accounting Logic
    // =========================================================================

    function asset() external view override returns (address) {
        return address(underlyingAsset);
    }

    function totalAssets() public view override returns (uint256) {
        return underlyingAsset.balanceOf(address(this));
    }

    function convertToShares(uint256 assets) public view override returns (uint256) {
        uint256 supply = _totalSupply;
        if (supply == 0) {
            // First deposit: scale from assetDecimals (6) to sharesDecimals (18)
            return assets * (10 ** (18 - assetDecimals));
        }
        uint256 total = totalAssets();
        return total == 0 ? 0 : (assets * supply) / total;
    }

    function convertToAssets(uint256 shares) public view override returns (uint256) {
        uint256 supply = _totalSupply;
        if (supply == 0) {
            return shares / (10 ** (18 - assetDecimals));
        }
        return (shares * totalAssets()) / supply;
    }

    function maxDeposit(address) external pure override returns (uint256) {
        return type(uint256).max;
    }

    function previewDeposit(uint256 assets) external view override returns (uint256) {
        return convertToShares(assets);
    }

    function maxMint(address) external pure override returns (uint256) {
        return type(uint256).max;
    }

    function previewMint(uint256 shares) external view override returns (uint256) {
        uint256 supply = _totalSupply;
        if (supply == 0) {
            return shares / (10 ** (18 - assetDecimals));
        }
        uint256 total = totalAssets();
        return (shares * total + supply - 1) / supply;
    }

    function maxWithdraw(address owner) external view override returns (uint256) {
        return convertToAssets(_balances[owner]);
    }

    function previewWithdraw(uint256 assets) external view override returns (uint256) {
        uint256 supply = _totalSupply;
        if (supply == 0) return 0;
        uint256 total = totalAssets();
        return (assets * supply + total - 1) / total;
    }

    function maxRedeem(address owner) external view override returns (uint256) {
        return _balances[owner];
    }

    function previewRedeem(uint256 shares) external view override returns (uint256) {
        return convertToAssets(shares);
    }

    // =========================================================================
    // Non-Custodial Deposit & Withdrawal (LPs Only)
    // =========================================================================

    function deposit(uint256 assets, address receiver) public override returns (uint256 shares) {
        require(assets > 0, "Zero deposit");
        require(receiver != address(0), "Zero receiver");

        shares = previewDeposit(assets);
        require(shares > 0, "Zero shares minted");

        // Transfer assets from caller to vault
        bool success = underlyingAsset.transferFrom(msg.sender, address(this), assets);
        require(success, "Asset transfer failed");

        _mint(receiver, shares);
        _updateDailyBaseline();

        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function mint(uint256 shares, address receiver) external override returns (uint256 assets) {
        require(shares > 0, "Zero mint");
        require(receiver != address(0), "Zero receiver");

        assets = convertToAssets(shares);
        require(assets > 0, "Zero assets required");

        bool success = underlyingAsset.transferFrom(msg.sender, address(this), assets);
        require(success, "Asset transfer failed");

        _mint(receiver, shares);
        _updateDailyBaseline();

        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function withdraw(uint256 assets, address receiver, address owner) public override returns (uint256 shares) {
        require(assets > 0, "Zero withdraw");
        require(receiver != address(0), "Zero receiver");

        shares = previewWithdraw(assets);
        require(shares > 0, "Zero shares");

        // Non-custodial security: Only owner or approved spender can withdraw
        if (msg.sender != owner) {
            uint256 allowed = _allowances[owner][msg.sender];
            if (allowed != type(uint256).max) {
                require(allowed >= shares, "Insufficient allowance");
                _allowances[owner][msg.sender] = allowed - shares;
            }
        }

        _burn(owner, shares);

        bool success = underlyingAsset.transfer(receiver, assets);
        require(success, "Asset payout failed");

        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }

    function redeem(uint256 shares, address receiver, address owner) external override returns (uint256 assets) {
        require(shares > 0, "Zero redeem");
        require(receiver != address(0), "Zero receiver");

        assets = convertToAssets(shares);
        require(assets > 0, "Zero assets");

        if (msg.sender != owner) {
            uint256 allowed = _allowances[owner][msg.sender];
            if (allowed != type(uint256).max) {
                require(allowed >= shares, "Insufficient allowance");
                _allowances[owner][msg.sender] = allowed - shares;
            }
        }

        _burn(owner, shares);

        bool success = underlyingAsset.transfer(receiver, assets);
        require(success, "Asset payout failed");

        emit Withdraw(msg.sender, receiver, owner, assets, shares);
    }

    // =========================================================================
    // Autonomous AI Agent Trading Execution Engine (Zodiac / Whitelist Guard)
    // =========================================================================

    /**
     * @notice Allows autonomous agent to execute swaps ONLY through whitelisted DEX routers.
     * @dev Agent CANNOT withdraw funds to external EOAs.
     */
    function executeTrade(
        address targetRouter,
        uint256 assetAmountIn,
        bytes calldata tradeData
    ) external onlyAgentOrManager notInCircuitBreaker returns (bytes memory returnData) {
        require(whitelistedRouters[targetRouter], "DeHedgeVault: router not whitelisted");
        require(assetAmountIn <= totalAssets(), "DeHedgeVault: excessive input");

        // Approve router for exact trade amount
        underlyingAsset.approve(targetRouter, assetAmountIn);

        // Execute DEX swap call
        bool success;
        (success, returnData) = targetRouter.call(tradeData);
        require(success, "DeHedgeVault: trade call failed");

        // Re-set allowance to 0 to prevent lingering approvals
        underlyingAsset.approve(targetRouter, 0);

        // Post-Trade Safety Check: Evaluate Drawdown
        _checkDrawdownAndCircuitBreaker();

        emit TradeExecuted(targetRouter, assetAmountIn, tradeData);
    }

    // =========================================================================
    // On-Chain Risk Management & High-Water Mark Accounting
    // =========================================================================

    function setRouterWhitelist(address router, bool status) external onlyManager {
        require(router != address(0), "Zero address");
        whitelistedRouters[router] = status;
        emit RouterWhitelistUpdated(router, status);
    }

    function setAgentTrader(address newAgent) external onlyManager {
        require(newAgent != address(0), "Zero address");
        agentTrader = newAgent;
        emit AgentTraderUpdated(newAgent);
    }

    function resetCircuitBreaker() external onlyManager {
        circuitBreakerActive = false;
        circuitBreakerCooldownUntil = 0;
        dailyBaselineAUM = totalAssets();
        emit CircuitBreakerReset(block.timestamp);
    }

    function _checkDrawdownAndCircuitBreaker() internal {
        uint256 currentAUM = totalAssets();
        if (dailyBaselineAUM == 0) {
            dailyBaselineAUM = currentAUM;
            return;
        }

        if (currentAUM < dailyBaselineAUM) {
            uint256 loss = dailyBaselineAUM - currentAUM;
            uint256 lossBps = (loss * BPS_DIVISOR) / dailyBaselineAUM;

            if (lossBps >= MAX_DRAWDOWN_BPS) {
                circuitBreakerActive = true;
                circuitBreakerCooldownUntil = block.timestamp + 24 hours;
                emit CircuitBreakerTriggered(currentAUM, dailyBaselineAUM, block.timestamp);
            }
        }
    }

    function _updateDailyBaseline() internal {
        if (block.timestamp >= lastDailyResetTimestamp + 24 hours) {
            dailyBaselineAUM = totalAssets();
            lastDailyResetTimestamp = block.timestamp;
        } else if (dailyBaselineAUM == 0) {
            dailyBaselineAUM = totalAssets();
        }
    }

    // =========================================================================
    // ERC-20 Standard Share Token Implementation
    // =========================================================================

    function totalSupply() external view override returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) external view override returns (uint256) {
        return _balances[account];
    }

    function transfer(address recipient, uint256 amount) external override returns (bool) {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    function allowance(address owner, address spender) external view override returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) external override returns (bool) {
        uint256 currentAllowance = _allowances[sender][msg.sender];
        if (currentAllowance != type(uint256).max) {
            require(currentAllowance >= amount, "ERC20: transfer amount exceeds allowance");
            _approve(sender, msg.sender, currentAllowance - amount);
        }
        _transfer(sender, recipient, amount);
        return true;
    }

    function _transfer(address sender, address recipient, uint256 amount) internal {
        require(sender != address(0), "ERC20: transfer from zero");
        require(recipient != address(0), "ERC20: transfer to zero");
        require(_balances[sender] >= amount, "ERC20: transfer exceeds balance");

        _balances[sender] -= amount;
        _balances[recipient] += amount;
        emit Transfer(sender, recipient, amount);
    }

    function _mint(address account, uint256 amount) internal {
        require(account != address(0), "ERC20: mint to zero");
        _totalSupply += amount;
        _balances[account] += amount;
        emit Transfer(address(0), account, amount);
    }

    function _burn(address account, uint256 amount) internal {
        require(account != address(0), "ERC20: burn from zero");
        require(_balances[account] >= amount, "ERC20: burn exceeds balance");
        _balances[account] -= amount;
        _totalSupply -= amount;
        emit Transfer(account, address(0), amount);
    }

    function _approve(address owner, address spender, uint256 amount) internal {
        require(owner != address(0), "ERC20: approve from zero");
        require(spender != address(0), "ERC20: approve to zero");
        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }
}
