# -*- coding: utf-8 -*-
"""HTTP client to the DeepSeek Harness ``/api`` gateway.

Wire facts (verified against the running harness):

* **Auth is a token→cookie exchange, not Bearer.** ``GET <base>/?token=<launch
  token>`` answers 303 and sets a signed ``dsh-auth-*`` cookie (30 days);
  every ``/api`` call must carry that cookie. The launch token is printed by
  ``dsh web`` at startup and changes on every harness restart — update it in
  Settings > MTIL Agent after a restart. The harness must also trust this
  Odoo-facing domain (``--trusted-host``), because its Host fence rejects
  unknown authorities with 403.
* **Unary RPC**: ``POST <base>/api/<namespace>/<method>`` with the envelope
  ``{"type": "client-request", "rpcId": <uuid>, "method": ..., "payload":
  {"args": {...}}}``; the args field names are the host method's parameter
  names (e.g. ``session/list`` takes ``{"_request": {}}``). The response is
  ``{"type": "server-response", "result": {"ok": true, "value": ...}}``.

:class:`HarnessWire` holds that wire logic free of any Odoo import so it can
be exercised directly against a harness; :class:`HarnessClient` is the thin
``AbstractModel`` adapter reading the connection from ``ir.config_parameter``.
"""
import base64
import hashlib
import hmac
import json
import logging
import threading
import time
import uuid

import requests

from odoo import _, api, models
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

# ir.config_parameter keys holding the harness connection material.
CONFIG_BASE_URL = 'npei_agent_harness.base_url'
CONFIG_API_TOKEN = 'npei_agent_harness.api_token'
# Shared HMAC-SHA256 secret the MTIL gate signs SPA tickets with.
CONFIG_TICKET_SECRET = 'npei_agent_harness.ticket_secret'

# Seconds before a management RPC to the harness is abandoned.
HARNESS_RPC_TIMEOUT = 30

# Ticket wire rules — MUST match the MTIL gate and the harness.
TICKET_VERSION = 'v1'
MIN_TICKET_SECRET_LENGTH = 32
DEFAULT_TICKET_TTL_SECONDS = 600


class HarnessWireError(Exception):
    """Transport or business failure of one harness call (message is user-safe)."""


class HarnessWire:
    """Cookie-authenticated wire to one harness base URL.

    Holds a ``requests.Session`` whose ``dsh-auth-*`` cookie is minted from
    the launch token on first use and re-minted once on a 401 (cookie expiry
    or a harness that restarted onto the same token).
    """

    def __init__(self, base_url, token):
        self.base_url = base_url.rstrip('/')
        self.token = token
        self.http = requests.Session()
        self._authenticated = False

    def _authenticate(self):
        """Exchange the launch token for the session cookie, fail-loud."""
        try:
            response = self.http.get(
                '%s/?token=%s' % (self.base_url, self.token),
                timeout=HARNESS_RPC_TIMEOUT,
                allow_redirects=True,
            )
        except requests.RequestException as exc:
            raise HarnessWireError('Cannot reach the DeepSeek Harness: %s' % exc)
        if response.status_code == 401 or not any(
                cookie.name.startswith('dsh-auth-') for cookie in self.http.cookies):
            raise HarnessWireError(
                'The harness rejected the API token (HTTP %s). The launch token '
                'changes on every harness restart — copy the current one from '
                'the dsh web startup line.' % response.status_code)
        self._authenticated = True

    def _post_rpc(self, method, args):
        envelope = {
            'type': 'client-request',
            'rpcId': str(uuid.uuid4()),
            'method': method,
            'payload': {'args': args},
        }
        return self.http.post(
            '%s/api/%s' % (self.base_url, method),
            data=json.dumps(envelope),
            headers={'Content-Type': 'application/json'},
            timeout=HARNESS_RPC_TIMEOUT,
        )

    def rpc(self, method, args=None):
        """Call one unary harness method and return ``result.value``.

        :param str method: a Remote endpoint, e.g. ``session/list``.
        :param dict args: named args matching the host method's parameters.
        :raises HarnessWireError: transport failure, non-200, or ``ok: false``.
        """
        args = args if args is not None else {}
        if not self._authenticated:
            self._authenticate()
        try:
            response = self._post_rpc(method, args)
            if response.status_code == 401:
                # Cookie expired (30-day lifetime): one re-mint, then retry.
                self._authenticate()
                response = self._post_rpc(method, args)
        except requests.RequestException as exc:
            raise HarnessWireError('Cannot reach the DeepSeek Harness: %s' % exc)
        if response.status_code != 200:
            raise HarnessWireError(
                'Harness call %s failed (HTTP %s): %s'
                % (method, response.status_code, response.text[:500]))
        try:
            body = response.json()
        except ValueError:
            raise HarnessWireError('Harness call %s returned a non-JSON body.' % method)
        result = (body or {}).get('result') or {}
        if not result.get('ok', False):
            error = result.get('error') or {}
            raise HarnessWireError(
                'Harness call %s returned an error: %s: %s'
                % (method, error.get('code'), error.get('message')))
        return result.get('value')

    def raw_post(self, path, data, content_type='application/json'):
        """Forward one raw POST under the authenticated cookie session.

        401 re-mints the cookie once and retries, mirroring :meth:`rpc`.
        :returns: the ``requests.Response``.
        """
        if not self._authenticated:
            self._authenticate()
        url = '%s/%s' % (self.base_url, path.lstrip('/'))
        headers = {'Content-Type': content_type}
        response = self.http.post(url, data=data, headers=headers, timeout=HARNESS_RPC_TIMEOUT)
        if response.status_code == 401:
            self._authenticate()
            response = self.http.post(url, data=data, headers=headers, timeout=HARNESS_RPC_TIMEOUT)
        return response

    def raw_get(self, path, params=None, stream=False, timeout=None):
        """Forward one raw GET under the authenticated cookie session."""
        if not self._authenticated:
            self._authenticate()
        url = '%s/%s' % (self.base_url, path.lstrip('/'))
        timeout = timeout or HARNESS_RPC_TIMEOUT
        response = self.http.get(url, params=params, stream=stream, timeout=timeout)
        if response.status_code == 401:
            self._authenticate()
            response = self.http.get(url, params=params, stream=stream, timeout=timeout)
        return response

    def boot_payload_status(self):
        """Probe ``GET /api/boot.payload`` (host reachability + auth in one).

        :returns: ``(http_status, injection_row_count_or_None)``.
        """
        if not self._authenticated:
            self._authenticate()
        try:
            response = self.http.get(
                '%s/api/boot.payload' % self.base_url, timeout=HARNESS_RPC_TIMEOUT)
        except requests.RequestException as exc:
            raise HarnessWireError('Cannot reach the DeepSeek Harness: %s' % exc)
        rows = None
        if response.status_code == 200:
            try:
                rows = len(response.json().get('injections') or [])
            except ValueError:
                rows = None
        return response.status_code, rows


# One wire per (base_url, token) per worker process; the cookie survives
# across requests, and a settings change simply keys a fresh wire.
_WIRES = {}
_WIRES_LOCK = threading.Lock()


def _wire_for(base_url, token):
    key = (base_url, token)
    with _WIRES_LOCK:
        wire = _WIRES.get(key)
        if wire is None:
            _WIRES.clear()  # a connection change invalidates the previous wire
            wire = _WIRES[key] = HarnessWire(base_url, token)
        return wire


class HarnessClient(models.AbstractModel):
    """Stateless helper that talks to the harness ``/api`` gateway."""

    _name = 'npei.agent.harness.client'
    _description = 'DeepSeek Harness HTTP Client'

    @api.model
    def _get_connection(self):
        """Return ``(base_url, token)`` for the harness, or fail loud."""
        params = self.env['ir.config_parameter'].sudo()
        base_url = (params.get_param(CONFIG_BASE_URL) or '').strip().rstrip('/')
        token = (params.get_param(CONFIG_API_TOKEN) or '').strip()
        if not base_url or not token:
            raise UserError(_(
                "The DeepSeek Harness connection is not configured. "
                "Set both the Base URL and the API Token under "
                "Settings > MTIL Agent."
            ))
        return base_url, token

    @api.model
    def _rpc(self, method, args=None):
        """Call one unary harness method and return ``result.value``.

        :param str method: a Remote endpoint such as ``agentPresets/list``.
        :param dict args: named args matching the host method's parameter
            names (``session/list`` takes ``{'_request': {}}``).
        :returns: the ``result.value`` (dict, list, or scalar; ``None`` for void).
        """
        base_url, token = self._get_connection()
        wire = _wire_for(base_url, token)
        self._attach_admin_ticket(wire)
        try:
            return wire.rpc(method, args)
        except HarnessWireError as exc:
            _logger.warning("Harness RPC %s failed: %s", method, exc)
            raise UserError(_("%s", exc))

    @api.model
    def _attach_admin_ticket(self, wire):
        """Attach the management wildcard ticket to the wire's cookie jar.

        The harness scopes ``session/list``/``session/search`` by the
        ``mtil-ticket`` cookie; Odoo is the trusted management plane and must
        see every session to administer access lists, so it presents a ticket
        for user ``*`` — the harness-recognized wildcard. Minted fresh per
        call (cheap HMAC) so wire reuse never presents an expired ticket.
        Without a configured Ticket Secret the cookie is left absent and the
        harness treats Odoo as anonymous (unrestricted sessions only).
        """
        secret = (self.env['ir.config_parameter'].sudo()
                  .get_param(CONFIG_TICKET_SECRET) or '').strip()
        if len(secret) < MIN_TICKET_SECRET_LENGTH:
            return
        ticket, _expires = self.mint_user_ticket('*')
        wire.http.cookies.set('mtil-ticket', ticket)

    @api.model
    def _host_status(self):
        """Probe the harness boot payload for the Host Status wizard.

        :returns: ``(http_status, injection_row_count_or_None)``.
        """
        base_url, token = self._get_connection()
        try:
            return _wire_for(base_url, token).boot_payload_status()
        except HarnessWireError as exc:
            raise UserError(_("%s", exc))

    # ------------------------------------------------------------------
    # SPA user-ticket minting (for the MTIL get_config_v2 gate)
    # ------------------------------------------------------------------
    @api.model
    def _b64url_nopad(self, raw):
        """base64url-encode without ``=`` padding (matches JS ``base64url``)."""
        return base64.urlsafe_b64encode(raw).rstrip(b'=').decode('ascii')

    @api.model
    def mint_user_ticket(self, user_id, ttl_seconds=DEFAULT_TICKET_TTL_SECONDS):
        """Mint a ``v1`` harness user-ticket for ``user_id``.

        Signs ``{"u": str(user_id), "exp": <unix>}`` with HMAC-SHA256 over the
        shared secret in ``ir.config_parameter``. ``u`` MUST be the identifier
        the session ACL is keyed by (a ``res.users`` id as a string).

        :returns: ``(ticket, expires_at)``.
        :raises UserError: when the secret is unset or below the minimum length.
        """
        secret = (self.env['ir.config_parameter'].sudo()
                  .get_param(CONFIG_TICKET_SECRET) or '').strip()
        if len(secret) < MIN_TICKET_SECRET_LENGTH:
            raise UserError(_(
                "The harness Ticket Secret is unset or shorter than %d characters. "
                "Set it under Settings > MTIL Agent.", MIN_TICKET_SECRET_LENGTH))
        expires_at = int(time.time()) + int(ttl_seconds)
        payload = json.dumps({'u': str(user_id), 'exp': expires_at}, separators=(',', ':'))
        body = self._b64url_nopad(payload.encode('utf-8'))
        signing_input = '%s.%s' % (TICKET_VERSION, body)
        mac = hmac.new(secret.encode('utf-8'), signing_input.encode('ascii'), hashlib.sha256).digest()
        return '%s.%s' % (signing_input, self._b64url_nopad(mac)), expires_at

    @api.model
    def api_get_config_v2(self, user_id):
        """Access-gate payload for the MTIL SPA: mint a ticket for ``user_id``.

        :returns: ``{'status': True, 'message': '', 'datas': {'ticket', 'expires_at'}}``.
        """
        ticket, expires_at = self.mint_user_ticket(user_id)
        return {
            'status': True,
            'message': '',
            'datas': {'ticket': ticket, 'expires_at': expires_at},
        }
