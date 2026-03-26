from fastapi import HTTPException, status

from models.public_brand import PublicBrandResponse, PublicPageHighlights
from services.auth_store import get_tenant_by_slug
from services.catalog_service import list_tenant_catalog
from services.spark_service import fetch_tenant_spark


def fetch_public_brand(slug: str) -> PublicBrandResponse:
    normalized_slug = slug.strip().lower()
    tenant = get_tenant_by_slug(normalized_slug)
    if not tenant or not tenant.get("is_active"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found.")

    spark = fetch_tenant_spark(tenant)
    catalog = list_tenant_catalog(tenant)
    has_promotions = any(item.isPromotion for item in catalog)
    has_new_arrivals = any(item.isNewArrival for item in catalog)

    return PublicBrandResponse(
        slug=tenant["slug"],
        spark=spark,
        catalog=catalog,
        theme=spark.theme,
        pageSections=spark.pageSections,
        pageHighlights=PublicPageHighlights(
            hasPromotions=has_promotions,
            hasNewArrivals=has_new_arrivals,
        )
        if has_promotions or has_new_arrivals
        else None,
    )
