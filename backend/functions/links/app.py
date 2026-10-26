import base64
import json
import os
import secrets
import string
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from urllib.parse import urlsplit

import boto3
from boto3.dynamodb.conditions import Attr, Key
from botocore.exceptions import ClientError

table = boto3.resource("dynamodb").Table(os.environ["LINKS_TABLE"])
ALPHABET = string.ascii_letters + string.digits


def reply(status, data):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Cache-Control": "no-store"},
        "body": json.dumps(data),
    }


def valid_url(value):
    if not isinstance(value, str) or not (1 <= len(value) <= 2048):
        return False
    if any(ord(char) <= 32 or ord(char) == 127 for char in value):
        return False
    try:
        parts = urlsplit(value)
        if parts.scheme not in ("http", "https") or not parts.hostname:
            return False
        if parts.username or parts.password:
            return False
        _ = parts.port
        return True
    except ValueError:
        return False


def safe_link(item):
    return {
        "shortCode": item["shortCode"],
        "originalUrl": item["originalUrl"],
        "createdAt": item["createdAt"],
        "expiresAt": item.get("expiresAt"),
        "isActive": item.get("isActive", False),
        "totalClicks": int(item.get("totalClicks", 0)),
        "lastClickedAt": item.get("lastClickedAt"),
    }


def parse_body(event):
    try:
        data = json.loads(event.get("body") or "{}")
        return data if isinstance(data, dict) else None
    except (ValueError, TypeError):
        return None


def create_link(event, owner):
    body = parse_body(event)
    if body is None:
        return reply(400, {"error": "A JSON object is required"})

    original = body.get("originalUrl")
    if not valid_url(original):
        return reply(400, {"error": "Enter a valid HTTP/HTTPS URL (max 2048 characters)"})

    expiry = body.get("expiresAt")
    if expiry is not None:
        try:
            expiry_dt = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
            if expiry_dt.tzinfo is None or expiry_dt <= datetime.now(timezone.utc):
                raise ValueError("Invalid expiry")
        except (AttributeError, TypeError, ValueError):
            return reply(400, {"error": "expiresAt must be a future timezone-aware ISO timestamp"})

    for _ in range(5):
        code = "".join(secrets.choice(ALPHABET) for _ in range(7))
        item = {
            "shortCode": code,
            "ownerId": owner,
            "originalUrl": original,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "isActive": True,
            "totalClicks": 0,
        }
        if expiry is not None:
            item["expiresAt"] = expiry
        try:
            table.put_item(Item=item, ConditionExpression="attribute_not_exists(shortCode)")
            return reply(201, safe_link(item))
        except ClientError as exc:
            if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
                continue
            raise

    return reply(503, {"error": "Unable to create a unique code, please retry"})


def list_links(owner):
    # First 100 links, newest first. Pagination will be added when needed.
    result = table.query(
        IndexName="OwnerIndex",
        KeyConditionExpression=Key("ownerId").eq(owner),
        ScanIndexForward=False,
        Limit=100,
    )
    return reply(200, {
        "links": [safe_link(item) for item in result.get("Items", [])],
        "hasMore": "LastEvaluatedKey" in result,
    })


def get_owned_link(code, owner):
    result = table.get_item(Key={"shortCode": code}, ConsistentRead=True)
    item = result.get("Item")
    if not item or item.get("ownerId") != owner:
        return None
    return item


def stats_for_link(code, owner):
    item = get_owned_link(code, owner)
    if item is None:
        return reply(404, {"error": "Link not found"})

    today = datetime.now(timezone.utc).date()
    daily = []
    for back in range(6, -1, -1):
        day = (today - timedelta(days=back)).isoformat()
        day_item = table.get_item(Key={"shortCode": f"DAY#{code}#{day}"}).get("Item", {})
        daily.append({"date": day, "clicks": int(day_item.get("clicks", 0))})

    return reply(200, {"link": safe_link(item), "dailyClicks": daily})


def update_link(event, code, owner):
    body = parse_body(event)
    if body is None or not isinstance(body.get("isActive"), bool):
        return reply(400, {"error": "Provide isActive as true or false"})

    try:
        result = table.update_item(
            Key={"shortCode": code},
            UpdateExpression="SET isActive = :active",
            ConditionExpression=Attr("ownerId").eq(owner),
            ExpressionAttributeValues={":active": body["isActive"]},
            ReturnValues="ALL_NEW",
        )
        return reply(200, {"link": safe_link(result["Attributes"])})
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return reply(404, {"error": "Link not found"})
        raise


def lambda_handler(event, context):
    claims = (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("jwt", {})
        .get("claims", {})
    )
    owner = claims.get("sub")
    if not owner:
        return reply(401, {"error": "Unauthorized"})

    route = event.get("routeKey", "")
    code = (event.get("pathParameters") or {}).get("code")

    if route == "POST /links":
        return create_link(event, owner)
    if route == "GET /links":
        return list_links(owner)
    if route == "GET /links/{code}/stats" and code:
        return stats_for_link(code, owner)
    if route == "PATCH /links/{code}" and code:
        return update_link(event, code, owner)
    return reply(404, {"error": "Route not found"})
