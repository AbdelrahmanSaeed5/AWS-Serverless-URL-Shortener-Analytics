import json
import logging
import os
import re
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)
table = boto3.resource("dynamodb").Table(os.environ["LINKS_TABLE"])


def error_response(status, message):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Cache-Control": "no-store"},
        "body": json.dumps({"error": message}),
    }


def lambda_handler(event, context):
    code = (event.get("pathParameters") or {}).get("code", "")
    if not re.fullmatch(r"[A-Za-z0-9]{7}", code):
        return error_response(404, "Link not found")

    try:
        item = table.get_item(
            Key={"shortCode": code}, ConsistentRead=True
        ).get("Item")
    except ClientError:
        logger.exception("Could not retrieve link")
        return error_response(503, "Service unavailable")

    if not item:
        return error_response(404, "Link not found")
    if not item.get("isActive", False):
        return error_response(410, "Link is inactive")

    expiry = item.get("expiresAt")
    if expiry:
        try:
            until = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
            if until.tzinfo is None or datetime.now(timezone.utc) >= until:
                return error_response(410, "Link has expired")
        except (ValueError, TypeError):
            return error_response(410, "Link is unavailable")

    now = datetime.now(timezone.utc)
    try:
        table.update_item(
            Key={"shortCode": code},
            UpdateExpression="SET lastClickedAt = :now ADD totalClicks :one",
            ConditionExpression="attribute_exists(shortCode) AND isActive = :active",
            ExpressionAttributeValues={
                ":now": now.isoformat(), ":one": 1, ":active": True
            },
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return error_response(410, "Link is unavailable")
        logger.exception("Could not update total click count")
    else:
        # Store aggregated UTC daily analytics without recording personal data.
        # A failed analytics write must not interrupt the redirect.
        try:
            table.update_item(
                Key={"shortCode": f"DAY#{code}#{now.date().isoformat()}"},
                UpdateExpression="ADD clicks :one",
                ExpressionAttributeValues={":one": 1},
            )
        except ClientError:
            logger.exception("Could not update daily click count")

    return {
        "statusCode": 302,
        "headers": {
            "Location": item["originalUrl"],
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
        },
        "body": "",
    }
