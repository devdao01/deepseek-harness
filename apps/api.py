# -*- coding: utf-8 -*-
"""MTIL API — the `get_config_v2` access gate and harness ticket minter (Flask).

Reference implementation to copy into the MTIL Flask API. It adds ONE endpoint,
``POST /api/mtil/get_config_v2``, which the SPA calls once at startup:

* Not signed in  -> HTTP 401, ``{"status": false, "error_code": "UNAUTHORIZED", ...}``
* Signed in      -> HTTP 200, ``{"status": true, "datas": {"ticket": ..., "expires_at": ...}}``

On success the ticket is delivered as an ``HttpOnly`` cookie
(``Set-Cookie: dsh_ticket=...``) on the shared origin, so the browser sends it
automatically on every same-origin ``/api`` request — unary fetches, the
WebSocket handshakes, AND GET downloads alike — without page scripts ever seeing
it. The response body also returns ``datas.expires_at`` so the SPA can schedule a
refresh (it cannot read the HttpOnly cookie's own lifetime). The harness only
VERIFIES the ticket; minting and refresh are this API's job. The existing
``get_config`` endpoint is left untouched — this is a separate ``_v2`` route.

The cookie is ``HttpOnly; Secure; SameSite=Strict; Path=/api``:

* ``HttpOnly`` — page scripts cannot read it, so XSS cannot exfiltrate the ticket.
* ``SameSite=Strict`` — never sent on cross-site requests, which (together with
  the harness Origin===Host fence) closes the CSRF that ambient cookies invite.
* ``Secure`` — HTTPS only. On a plain-HTTP LAN set ``DSH_TICKET_COOKIE_SECURE=0``
  until TLS is in front; re-enable it in production.
* Same-origin deployment is REQUIRED: MTIL, the harness, and the SPA must share
  one origin (nginx maps ``/api/mtil/*`` here and the rest of ``/api`` to the
  harness) or the cookie never reaches the harness.

Ticket wire format (must match ``@deepseek-ai/dsh-user-ticket`` exactly):

    v1.<b64url(payload)>.<b64url(HMAC_SHA256)>

* ``payload`` = ``{"u": <user_id>, "exp": <unix_seconds>}`` (JSON)
* MAC = HMAC-SHA256 over the ASCII string ``"v1." + b64url(payload)``
* base64url WITHOUT ``=`` padding; NO algorithm field (``alg:none`` is
  impossible by construction — the verifier only ever computes HMAC-SHA256).

Two hard requirements for interop:

1. ``TICKET_SECRET`` here MUST equal the harness ``DSH_TICKET_SECRET`` (>= 32
   chars). Keep it out of source; load it from the environment / secret store.
2. The ``user_id`` placed in the ticket MUST be the SAME identifier the session
   ACL is keyed by on the harness side (whatever populates
   ``dsh-session-access`` with the allowed users). A ticket only proves WHO the
   caller is; per-session access is enforced by the harness against that id.
"""
import base64
import hashlib
import hmac
import json
import os
import time
import uuid

import requests
from flask import Blueprint, jsonify, make_response, request

# --------------------------------------------------------------------------- #
# Configuration (load real values from the environment / secret store)
# --------------------------------------------------------------------------- #

#: Shared HMAC-SHA256 secret; identical to the harness ``DSH_TICKET_SECRET``.
TICKET_SECRET = os.environ.get("DSH_TICKET_SECRET", "")

#: Minimum secret length the harness enforces; fail loud rather than mint weak tickets.
MIN_TICKET_SECRET_LENGTH = 32

#: Minted lifetime in seconds. Keep it well under the harness max-TTL guard
#: (``DEFAULT_TICKET_MAX_TTL_SECONDS`` = 900); the browser re-mints before it
#: lapses. 10 minutes is the target.
TICKET_TTL_SECONDS = int(os.environ.get("DSH_TICKET_TTL_SECONDS", "600"))

#: Wire scheme prefix; the only version the harness verifier accepts.
_TICKET_VERSION = "v1"

#: Cookie the browser carries the ticket in; MUST match the harness
#: ``TICKET_COOKIE_NAME`` in ``@deepseek-ai/dsh-client-connection``.
TICKET_COOKIE_NAME = "dsh_ticket"

#: Path the cookie is scoped to. ``/api`` covers both this API (``/api/mtil/*``)
#: and the harness (the rest of ``/api``) on the shared origin.
TICKET_COOKIE_PATH = "/api"

#: Emit the ``Secure`` attribute (HTTPS-only). Default on; set
#: ``DSH_TICKET_COOKIE_SECURE=0`` for a plain-HTTP LAN until TLS is in front.
COOKIE_SECURE = os.environ.get("DSH_TICKET_COOKIE_SECURE", "1") not in ("0", "false", "False", "")

#: Harness ``/api`` base URL this API calls SERVER-SIDE with the full token to
#: create sessions and grant their creator. Never exposed to the browser.
HARNESS_BASE_URL = os.environ.get("DSH_HARNESS_BASE_URL", "http://127.0.0.1:3080").rstrip("/")

#: Full harness API token (``~/.dsh/api-token`` on the harness host). Server-side
#: secret; grants unscoped access, so it must NEVER reach the browser.
HARNESS_API_TOKEN = os.environ.get("DSH_HARNESS_API_TOKEN", "")

#: Seconds before a server-side harness call is abandoned.
HARNESS_RPC_TIMEOUT = 30

api = Blueprint("mtil_api", __name__)


# --------------------------------------------------------------------------- #
# Ticket minting
# --------------------------------------------------------------------------- #

def _b64url_nopad(raw: bytes) -> str:
    """base64url-encode without ``=`` padding, matching JS ``toString('base64url')``."""
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def sign_ticket(user_id: str, exp: int, secret: str) -> str:
    """Mint a ``v1`` ticket for ``user_id`` expiring at absolute Unix-seconds ``exp``.

    :param user_id: identifier keyed into the harness session ACL (as a string).
    :param exp: absolute expiry in Unix seconds.
    :param secret: the shared HMAC-SHA256 secret (same as ``DSH_TICKET_SECRET``).
    :returns: the encoded ``v1.<payload>.<mac>`` ticket.
    """
    payload = {"u": str(user_id), "exp": int(exp)}
    # Compact separators keep the body tidy; the MAC is self-consistent either
    # way, since the verifier signs the token's own body string.
    body = _b64url_nopad(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = "%s.%s" % (_TICKET_VERSION, body)
    mac = hmac.new(secret.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
    return "%s.%s" % (signing_input, _b64url_nopad(mac))


def mint_ticket(user_id: str) -> "tuple[str, int]":
    """Mint a fresh ticket for ``user_id``, returning ``(ticket, expires_at)``.

    :raises RuntimeError: when the secret is missing or shorter than the minimum
        the harness accepts — minting a rejectable ticket is never useful.
    """
    if len(TICKET_SECRET) < MIN_TICKET_SECRET_LENGTH:
        raise RuntimeError(
            "DSH_TICKET_SECRET is unset or shorter than %d characters; cannot mint a ticket"
            % MIN_TICKET_SECRET_LENGTH
        )
    expires_at = int(time.time()) + TICKET_TTL_SECONDS
    return sign_ticket(user_id, expires_at, TICKET_SECRET), expires_at


# --------------------------------------------------------------------------- #
# Auth resolution — WIRE THIS TO THE EXISTING MTIL SESSION CHECK
# --------------------------------------------------------------------------- #

def _current_user_id() -> "str | None":
    """Return the signed-in user's id (as a string), or ``None`` when anonymous.

    Placeholder: replace the body with the SAME session-cookie resolution the
    existing ``get_config`` uses (``session_id`` -> user). The returned id must
    match the identifier the harness session ACL is keyed by.
    """
    # Example shape — adapt to the real MTIL session layer:
    #   from flask import session
    #   return str(session["user_id"]) if session.get("user_id") else None
    raise NotImplementedError("wire _current_user_id() to the MTIL session check")


# --------------------------------------------------------------------------- #
# Response envelope (matches the existing MTIL API shape)
# --------------------------------------------------------------------------- #

def _envelope(status: bool, http_status: int, datas=None, message="", error_code=""):
    """Build a Flask response carrying the MTIL JSON envelope and an HTTP status."""
    body = {
        "status": status,
        "error_code": error_code,
        "message": message,
        "datas": datas if datas is not None else {},
    }
    response = make_response(jsonify(body), http_status)
    return response


def _set_ticket_cookie(response, ticket: str, max_age: int):
    """Attach the HttpOnly ticket cookie to ``response`` (see module docstring)."""
    response.set_cookie(
        TICKET_COOKIE_NAME,
        ticket,
        max_age=max_age,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="Strict",
        path=TICKET_COOKIE_PATH,
    )


def _clear_ticket_cookie(response):
    """Drop any stale ticket cookie so a rejected caller keeps no credential."""
    response.delete_cookie(TICKET_COOKIE_NAME, path=TICKET_COOKIE_PATH)


# --------------------------------------------------------------------------- #
# Harness client (server-side, full token) — for session.create + setAccess
# --------------------------------------------------------------------------- #

class HarnessError(Exception):
    """A harness call failed transport or returned a business error."""


def _harness_rpc(method: str, payload: dict) -> dict:
    """Call one unary harness method with the FULL token and return ``result.value``.

    Wraps ``payload`` in the ``client-request`` envelope, mints an ``rpcId``,
    POSTs to ``<base>/api/<method>`` with the Bearer full token, and unwraps the
    ``server-response``. A server-side request carries no browser markers, so
    the token alone passes the harness trust fence.

    :raises HarnessError: on a missing token, transport failure, non-200, or a
        business ``result.ok == false``.
    """
    if not HARNESS_API_TOKEN:
        raise HarnessError("DSH_HARNESS_API_TOKEN is unset")
    envelope = {
        "type": "client-request",
        "rpcId": str(uuid.uuid4()),
        "method": method,
        "payload": payload,
    }
    try:
        response = requests.post(
            "%s/api/%s" % (HARNESS_BASE_URL, method),
            data=json.dumps(envelope),
            headers={
                "Authorization": "Bearer %s" % HARNESS_API_TOKEN,
                "Content-Type": "application/json",
            },
            timeout=HARNESS_RPC_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise HarnessError("harness unreachable: %s" % exc)
    if response.status_code != 200:
        raise HarnessError("harness %s HTTP %s" % (method, response.status_code))
    result = (response.json() or {}).get("result") or {}
    if not result.get("ok", False):
        error = result.get("error") or {}
        raise HarnessError(error.get("code") or "harness error")
    return result.get("value") or {}


# --------------------------------------------------------------------------- #
# Route
# --------------------------------------------------------------------------- #

@api.route("/api/mtil/get_config_v2", methods=["POST"])
def get_config_v2():
    """Access gate + ticket mint.

    Anonymous callers get a 401 the SPA renders as its denied screen; signed-in
    callers get a 200 with a fresh harness ticket in ``datas``. The harness
    token is never exposed — the browser only ever holds this short-lived,
    per-user ticket.
    """
    user_id = _current_user_id()
    if user_id is None:
        response = _envelope(
            False, 401,
            error_code="UNAUTHORIZED",
            message=u"Chưa Đăng nhập",
        )
        _clear_ticket_cookie(response)
        return response
    try:
        ticket, expires_at = mint_ticket(user_id)
    except RuntimeError as exc:
        # Misconfiguration (missing/short secret): fail loud, do not pretend to authorize.
        return _envelope(False, 500, error_code="TICKET_UNAVAILABLE", message=str(exc))
    # The ticket rides an HttpOnly cookie; the body carries only expires_at so
    # the SPA can schedule a refresh without ever reading the credential.
    response = _envelope(True, 200, datas={"expires_at": expires_at})
    _set_ticket_cookie(response, ticket, TICKET_TTL_SECONDS)
    return response


@api.route("/api/mtil/session_create", methods=["POST"])
def session_create():
    """Create a session ON BEHALF of the signed-in user and grant them access.

    A per-user ticket cannot call the full-token-only ``session.setAccess``, so
    a session it created directly on the harness would stay invisible to it
    (fail-closed). This endpoint runs the two full-token steps server-side —
    ``session.create`` then ``session.setAccess(sessionId, [user_id])`` — and
    returns the new ``sessionId`` for the SPA to open. Everything else (prompt,
    history, streams) the browser still calls on the harness DIRECTLY with its
    ticket cookie.

    Body (all optional): ``workspaceId`` | ``cwd`` (at most one) and
    ``agentPreset``. Mirrors ``session.create``'s request.
    """
    user_id = _current_user_id()
    if user_id is None:
        return _envelope(False, 401, error_code="UNAUTHORIZED", message=u"Chưa Đăng nhập")

    body = request.get_json(silent=True) or {}
    payload = {}
    for key in ("workspaceId", "cwd", "agentPreset"):
        value = body.get(key)
        if isinstance(value, str) and value:
            payload[key] = value

    try:
        created = _harness_rpc("session.create", payload)
        session_id = created.get("sessionId")
        if not session_id:
            raise HarnessError("session.create returned no sessionId")
        # Grant the creator so the session is visible to their ticket. The id
        # must match the ticket's ``u`` claim (same user-id space).
        _harness_rpc("session.setAccess", {"sessionId": session_id, "userIds": [str(user_id)]})
    except HarnessError as exc:
        return _envelope(False, 502, error_code="HARNESS_ERROR", message=str(exc))

    return _envelope(True, 200, datas={"sessionId": session_id})


# --------------------------------------------------------------------------- #
# Standalone smoke run:  DSH_TICKET_SECRET=... python apps/api.py
# --------------------------------------------------------------------------- #

if __name__ == "__main__":
    # Print one sample ticket so its format can be cross-checked against the
    # harness verifier. Uses a fixed demo user; real requests resolve the user
    # from the session cookie.
    demo_secret = TICKET_SECRET or ("x" * MIN_TICKET_SECRET_LENGTH)
    demo_exp = int(time.time()) + TICKET_TTL_SECONDS
    print(sign_ticket("42", demo_exp, demo_secret))
