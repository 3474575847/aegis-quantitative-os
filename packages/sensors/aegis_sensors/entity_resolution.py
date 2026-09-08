import re

from aegis_observability.logger import get_logger

logger = get_logger(__name__)


# Canonical mapping for common enterprise entities and cryptocurrencies
ENTITY_ALIAS_MAP: dict[str, str] = {
    # Equities
    "APPLE": "AAPL",
    "APPLE INC": "AAPL",
    "APPLE INC.": "AAPL",
    "MICROSOFT": "MSFT",
    "MICROSOFT CORP": "MSFT",
    "MICROSOFT CORPORATION": "MSFT",
    "NVIDIA": "NVDA",
    "NVIDIA CORP": "NVDA",
    "NVIDIA CORPORATION": "NVDA",
    "TESLA": "TSLA",
    "TESLA INC": "TSLA",
    "TESLA INC.": "TSLA",
    "AMAZON": "AMZN",
    "AMAZON.COM": "AMZN",
    "ALPHABET": "GOOGL",
    "GOOGLE": "GOOGL",
    "META": "META",
    "FACEBOOK": "META",
    # Cryptocurrencies
    "BITCOIN": "BTC",
    "BTC-USD": "BTC",
    "BTC/USD": "BTC",
    "ETHEREUM": "ETH",
    "ETHER": "ETH",
    "ETH-USD": "ETH",
    "ETH/USD": "ETH",
    "SOLANA": "SOL",
    "SOL-USD": "SOL",
}


class EntityResolver:
    """
    Normalizes company names, securities, and cryptocurrency identifiers
    into institutional canonical symbols.
    """

    def resolve_symbol(self, raw_reference: str) -> str:
        """Resolve a raw company name or ticker string into its canonical symbol."""
        if not raw_reference:
            return ""

        # Try the raw uppercased form first (preserves hyphens like BTC-USD)
        raw_upper = raw_reference.strip().upper()
        if raw_upper in ENTITY_ALIAS_MAP:
            return ENTITY_ALIAS_MAP[raw_upper]

        # Fall back to stripping non-word characters (handles "Apple Inc." -> "APPLE INC")
        cleaned = re.sub(r"[^\w\s]", " ", raw_reference).strip().upper()
        cleaned = re.sub(r"\s+", " ", cleaned)
        if cleaned in ENTITY_ALIAS_MAP:
            return ENTITY_ALIAS_MAP[cleaned]

        # Also try stripping all non-alphanumeric (handles edge cases)
        stripped = re.sub(r"[^\w]", "", raw_reference).strip().upper()
        if stripped in ENTITY_ALIAS_MAP:
            return ENTITY_ALIAS_MAP[stripped]

        # Check if already a valid ticker like AAPL, BTC, NVDA
        if re.match(r"^[A-Z]{1,5}$", stripped):
            return stripped

        return stripped

    def extract_entities_from_text(self, text: str) -> list[str]:
        """Extract canonical ticker symbols mentioned in a text snippet or headline."""
        if not text:
            return []

        found_symbols: set[str] = set()
        # Direct ticker patterns like $AAPL or uppercase words
        cashtags = re.findall(r"\$([A-Za-z]{1,5})\b", text)
        for tag in cashtags:
            found_symbols.add(self.resolve_symbol(tag))

        # Check known company names
        upper_text = text.upper()
        for alias, canonical in ENTITY_ALIAS_MAP.items():
            pattern = rf"\b{re.escape(alias)}\b"
            if re.search(pattern, upper_text):
                found_symbols.add(canonical)

        return sorted(found_symbols)
