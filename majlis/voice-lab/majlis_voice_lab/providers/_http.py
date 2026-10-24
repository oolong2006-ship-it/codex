"""Tiny stdlib HTTP helpers for self-hosted, OpenAI-compatible inference servers."""

from __future__ import annotations

import json
import os
import uuid
from collections.abc import Iterator
from typing import Any
from urllib.request import Request, urlopen


def auth_headers(options: dict[str, Any]) -> dict[str, str]:
    env_name = options.get("api_key_env")
    token = os.environ.get(env_name, "") if env_name else ""
    return {"Authorization": f"Bearer {token}"} if token else {}


def post_json(url: str, body: dict[str, Any], headers: dict[str, str], timeout: float):
    data = json.dumps(body).encode("utf-8")
    req = Request(url, data=data, headers={"Content-Type": "application/json", **headers})
    return urlopen(req, timeout=timeout)


def post_multipart(
    url: str,
    fields: dict[str, str],
    file_field: str,
    filename: str,
    content: bytes,
    headers: dict[str, str],
    timeout: float,
) -> dict[str, Any]:
    boundary = uuid.uuid4().hex
    parts: list[bytes] = []
    for name, value in fields.items():
        parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
        )
    parts.append(
        (
            f'--{boundary}\r\nContent-Disposition: form-data; name="{file_field}"; '
            f'filename="{filename}"\r\nContent-Type: application/octet-stream\r\n\r\n'
        ).encode()
        + content
        + b"\r\n"
    )
    parts.append(f"--{boundary}--\r\n".encode())
    req = Request(
        url,
        data=b"".join(parts),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}", **headers},
    )
    with urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def iter_sse_data(resp) -> Iterator[str]:
    """Yields `data:` payloads from a server-sent-events response."""
    for raw in resp:
        line = raw.decode("utf-8").strip()
        if line.startswith("data:"):
            payload = line[5:].strip()
            if payload == "[DONE]":
                return
            yield payload
