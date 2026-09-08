import re
import uuid
from datetime import timedelta
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from aegis_observability.logger import get_logger

from aegis_sensors.providers.models import CanonicalArticle, NewsArticle, ProvenanceBlock

logger = get_logger(__name__)

# Common tracking parameters to strip for canonical URL resolution
TRACKING_PARAMS = {
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "gclid",
    "fbclid",
    "ref",
    "source",
}


def normalize_canonical_url(raw_url: str) -> str:
    """Normalize a URL for cross-provider deduplication.

    Strips tracking query parameters (utm_*, gclid, etc.) and trailing slashes.
    """
    if not raw_url:
        return ""
    try:
        parsed = urlparse(raw_url.strip())
        query = parse_qs(parsed.query)
        filtered_query = {k: v for k, v in query.items() if k.lower() not in TRACKING_PARAMS}
        new_query = urlencode(filtered_query, doseq=True)

        scheme = "https" if parsed.scheme in ["http", "https"] else parsed.scheme
        netloc = parsed.netloc.lower()
        path = parsed.path.rstrip("/")

        return urlunparse((scheme, netloc, path, parsed.params, new_query, ""))
    except Exception:
        return raw_url.strip().lower()


def title_to_tokens(title: str) -> set[str]:
    """Tokenize a title into lowercase alphanumeric terms for similarity calculation."""
    cleaned = re.sub(r"[^\w\s]", " ", title.lower())
    return {w for w in cleaned.split() if len(w) > 2}


def title_similarity(title_a: str, title_b: str) -> float:
    """Compute similarity between two headlines using a blended overlap + Jaccard score.

    Uses 60% overlap coefficient (intersection / min-set-size) + 40% Jaccard.
    Overlap coefficient is robust to paraphrase where one title adds extra words
    but the shared core tokens dominate (e.g. "Q2" vs "Second-Quarter Revenue on Strong AI").
    """
    tokens_a = title_to_tokens(title_a)
    tokens_b = title_to_tokens(title_b)
    if not tokens_a or not tokens_b:
        return 0.0
    intersection = tokens_a.intersection(tokens_b)
    if not intersection:
        return 0.0
    jaccard = len(intersection) / len(tokens_a.union(tokens_b))
    overlap = len(intersection) / min(len(tokens_a), len(tokens_b))
    return 0.4 * jaccard + 0.6 * overlap


class ArticleDeduplicationEngine:
    """
    Cross-provider deduplication and canonical resolution engine.
    Separates provider observations from true independent publishers.
    """

    def __init__(self, title_threshold: float = 0.75, max_time_diff_hours: int = 24) -> None:
        self.title_threshold = title_threshold
        self.max_time_diff = timedelta(hours=max_time_diff_hours)

    def is_same_story(self, art_a: NewsArticle, art_b: NewsArticle) -> bool:
        """Determine whether two articles represent the same underlying report."""
        norm_url_a = normalize_canonical_url(art_a.canonical_url)
        norm_url_b = normalize_canonical_url(art_b.canonical_url)
        if norm_url_a and norm_url_b and norm_url_a == norm_url_b:
            return True

        # Check temporal proximity
        time_diff = abs(art_a.published_at - art_b.published_at)
        if time_diff > self.max_time_diff:
            return False

        # Check title similarity
        sim = title_similarity(art_a.title, art_b.title)
        if sim >= self.title_threshold:
            # Must also share either source domain or at least one ticker/topic
            same_domain = bool(art_a.source_domain and art_a.source_domain == art_b.source_domain)
            common_tickers = bool(set(art_a.tickers).intersection(set(art_b.tickers)))
            return same_domain or common_tickers or sim >= 0.90

        return False

    def deduplicate(self, articles: list[NewsArticle]) -> list[CanonicalArticle]:
        """
        Cluster observations into canonical articles.
        Crucial requirement: 1 canonical article references N provider observations,
        and distinguishes provider count from independent publisher count.
        """
        canonical_articles, _ = self.deduplicate_with_clusters(articles)
        return canonical_articles

    def deduplicate_with_clusters(
        self, articles: list[NewsArticle]
    ) -> tuple[list[CanonicalArticle], dict[str, list[NewsArticle]]]:
        """
        Same as ``deduplicate`` but additionally returns a mapping of
        ``canonical_article_id → [member NewsArticle]`` so callers can
        access the original observations without re-matching.
        """
        if not articles:
            return [], {}

        clusters: list[list[NewsArticle]] = []

        for article in articles:
            matched_cluster = None
            for cluster in clusters:
                if any(self.is_same_story(article, existing) for existing in cluster):
                    matched_cluster = cluster
                    break

            if matched_cluster is not None:
                matched_cluster.append(article)
            else:
                clusters.append([article])

        canonical_articles: list[CanonicalArticle] = []
        for cluster in clusters:
            primary = cluster[0]
            # Gather all provenance observations
            observations: list[ProvenanceBlock] = [a.provenance for a in cluster]

            # Distinguish provider count from independent publisher count
            providers = {a.provider for a in cluster}
            publishers = {
                a.source_domain or a.source_name
                for a in cluster
                if a.source_domain or a.source_name
            }
            if not publishers:
                publishers = {"unknown"}

            # Earliest point-in-time availability
            earliest_available = min(a.available_at for a in cluster)
            earliest_published = min(a.published_at for a in cluster)
            latest_retrieved = max(a.retrieved_at for a in cluster)

            # Combined tickers and companies without duplicates
            all_tickers = sorted({t for a in cluster for t in a.tickers if t})
            all_companies = sorted({c for a in cluster for c in a.companies if c})
            all_topics = sorted({top for a in cluster for top in a.topics if top})
            all_categories = sorted({cat for a in cluster for cat in a.categories if cat})

            # Sentiment calculation: weighted by publisher diversity, not redundant API calls
            sentiments = [
                a.provider_sentiment_score
                for a in cluster
                if a.provider_sentiment_score is not None
            ]
            aegis_sentiment = round(sum(sentiments) / len(sentiments), 4) if sentiments else 0.0

            # Corroboration score: function of independent publishers (not provider repeat counts)
            independent_count = len(publishers)
            if independent_count >= 3:
                corroboration = 0.95
            elif independent_count == 2:
                corroboration = 0.75
            else:
                corroboration = 0.50

            base = normalize_canonical_url(primary.canonical_url) or primary.title
            canonical_id = f"can_{uuid.uuid5(uuid.NAMESPACE_URL, base)}"

            canonical_articles.append(
                CanonicalArticle(
                    canonical_article_id=canonical_id,
                    title=primary.title,
                    canonical_url=primary.canonical_url,
                    published_at=earliest_published,
                    available_at=earliest_available,
                    retrieved_at=latest_retrieved,
                    tickers=all_tickers,
                    companies=all_companies,
                    topics=all_topics,
                    categories=all_categories,
                    independent_publishers=sorted(publishers),
                    independent_publisher_count=len(publishers),
                    provider_count=len(providers),
                    provider_observations=observations,
                    provider_sentiments=sentiments,
                    aegis_sentiment=aegis_sentiment,
                    corroboration_score=corroboration,
                )
            )

        # Build the cluster membership map: canonical_id → original NewsArticle list
        cluster_map: dict[str, list[NewsArticle]] = {
            can.canonical_article_id: cluster
            for can, cluster in zip(canonical_articles, clusters, strict=True)
        }

        return canonical_articles, cluster_map
