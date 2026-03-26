import json

from fastapi import HTTPException, status

from models.catalog import CatalogItemPayload
from services.auth_store import (
    create_catalog_item,
    delete_catalog_item,
    list_catalog_items_by_tenant_id,
    update_catalog_item,
)


def serialize_catalog_item(record: dict) -> CatalogItemPayload:
    return CatalogItemPayload(
        id=str(record["id"]),
        name=record["name"],
        description=record["description"],
        category=record.get("category"),
        price=record.get("price"),
        highlight=record.get("highlight"),
        priority=record.get("priority") or "medium",
        isFeatured=bool(record.get("is_featured")),
        isPromotion=bool(record.get("is_promotion")),
        isNewArrival=bool(record.get("is_new_arrival")),
        complements=json.loads(record["complements_json"]) if record.get("complements_json") else [],
        image=record.get("image"),
        images=json.loads(record["images_json"]) if record.get("images_json") else [],
        stock=record.get("stock"),
        availability=record.get("availability") or "available",
        title=record["name"],
    )


def list_tenant_catalog(tenant: dict) -> list[CatalogItemPayload]:
    return [serialize_catalog_item(item) for item in list_catalog_items_by_tenant_id(tenant["id"])]


def create_tenant_catalog_item(tenant: dict, item: CatalogItemPayload) -> CatalogItemPayload:
    created_item = create_catalog_item(
        tenant_id=tenant["id"],
        item_payload={
            "name": item.name,
            "category": item.category,
            "description": item.description,
            "price": item.price,
            "highlight": item.highlight,
            "stock": item.stock,
            "availability": item.availability,
            "image": item.image,
            "images_json": json.dumps(item.images or []),
            "priority": item.priority,
            "is_featured": int(item.isFeatured is True),
            "is_promotion": int(item.isPromotion is True),
            "is_new_arrival": int(item.isNewArrival is True),
            "complements_json": json.dumps(item.complements or []),
        },
    )
    return serialize_catalog_item(created_item)


def update_tenant_catalog_item(tenant: dict, item_id: int, item: CatalogItemPayload) -> CatalogItemPayload:
    updated_item = update_catalog_item(
        item_id=item_id,
        tenant_id=tenant["id"],
        item_payload={
            "name": item.name,
            "category": item.category,
            "description": item.description,
            "price": item.price,
            "highlight": item.highlight,
            "stock": item.stock,
            "availability": item.availability,
            "image": item.image,
            "images_json": json.dumps(item.images or []),
            "priority": item.priority,
            "is_featured": int(item.isFeatured is True),
            "is_promotion": int(item.isPromotion is True),
            "is_new_arrival": int(item.isNewArrival is True),
            "complements_json": json.dumps(item.complements or []),
        },
    )
    if not updated_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Catalog item not found.")

    return serialize_catalog_item(updated_item)


def delete_tenant_catalog_item(tenant: dict, item_id: int) -> None:
    deleted = delete_catalog_item(item_id=item_id, tenant_id=tenant["id"])
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Catalog item not found.")
