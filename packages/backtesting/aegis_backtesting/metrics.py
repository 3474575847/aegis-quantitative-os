import numpy as np
import pandas as pd


def calculate_sharpe_ratio(returns: pd.Series, risk_free_rate: float = 0.0) -> float:
    """Compute annualized Sharpe Ratio."""
    if returns.empty:
        return 0.0
    std = float(returns.std())
    if pd.isna(std) or std < 1e-9:
        return 0.0
    # Assuming daily returns, annualizing by sqrt(252)
    return float((returns.mean() - risk_free_rate) / std * np.sqrt(252))


def calculate_sortino_ratio(returns: pd.Series, risk_free_rate: float = 0.0) -> float:
    """Compute annualized Sortino Ratio (downside risk only)."""
    if returns.empty:
        return 0.0
    downside_returns = returns[returns < 0]
    if downside_returns.empty:
        return 0.0
    std = float(downside_returns.std())
    if pd.isna(std) or std < 1e-9:
        return 0.0
    return float((returns.mean() - risk_free_rate) / std * np.sqrt(252))


def calculate_max_drawdown(returns: pd.Series) -> float:
    """Compute the maximum peak-to-trough drawdown."""
    if returns.empty:
        return 0.0
    cumulative = (1 + returns).cumprod()
    running_max = cumulative.cummax()
    drawdown = (cumulative - running_max) / running_max
    return float(drawdown.min())


def calculate_win_rate(returns: pd.Series) -> float:
    """Percentage of periods with positive returns."""
    if returns.empty:
        return 0.0
    return float((returns > 0).sum() / len(returns))


def calculate_volatility(returns: pd.Series) -> float:
    """Annualized volatility of returns."""
    if returns.empty:
        return 0.0
    std = float(returns.std())
    if pd.isna(std):
        return 0.0
    return float(std * np.sqrt(252))


def calculate_cumulative_returns(returns: pd.Series) -> float:
    """Total cumulative return of the series."""
    if returns.empty:
        return 0.0
    return float((1 + returns).prod() - 1)


def get_performance_summary(returns: pd.Series) -> dict[str, float]:
    """Calculate a complete set of performance metrics."""
    return {
        "sharpe_ratio": calculate_sharpe_ratio(returns),
        "sortino_ratio": calculate_sortino_ratio(returns),
        "max_drawdown": calculate_max_drawdown(returns),
        "win_rate": calculate_win_rate(returns),
        "volatility": calculate_volatility(returns),
        "cumulative_returns": calculate_cumulative_returns(returns),
    }
