# -*- coding: utf-8 -*-
"""HTTP client to the DeepSeek Harness ``/api`` gateway.

The harness wire uses a 4-quadrant envelope model (see the SPA's
``docs/ui-api-reference.md``). This helper covers the two directions Odoo needs
server-side:

* unary RPC (``POST /api/<method>``) for management syncs, and
* the connection material (base URL + Bearer token) reused by the proxy
  controllers.

Auth: the harness trust fence lets a request carrying a valid
``Authorization: Bearer <token>`` and **no browser marker** (``Origin`` /
``sec-fetch-*``) through from anywhere. Server-side ``requests`` calls have no
browser markers, so the Bearer token alone authenticates them.
"""
import base64
import hashlib
import hmac
import json
import logging
import time
import uuid

import requests

from odoo import _, api, models
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

# ir.config_parameter keys holding the harness connection material.
CONFIG_BASE_URL = 'npei_agent_harness.base_url'
CONFIG_API_TOKEN = 'npei_agent_harness.api_token'
# Shared HMAC-SHA256 secret the MTIL Flask API signs SPA tickets with; the
# harness verifies against the same value (its DSH_TICKET_SECRET).
CONFIG_TICKET_SECRET = 'npei_agent_harness.ticket_secret'

# Seconds before a management RPC to the harness is abandoned.
HARNESS_RPC_TIMEOUT = 30

# Harness 0.1.2 replaced the ApiProxy unary routes with Typert Remote namespaces:
# a call is POST /api/<namespace>/<method> with the business payload carried under
# ``payload.args``. This maps the legacy dotted RpcMethodMap keys the module still
# calls onto the new <namespace>/<method> endpoints. Keys NOT listed default to a
# plain dot->slash (e.g. workspace.list -> workspace/list). Skills split into the
# session-addressed `skills` catalog and the workspace-addressed `skillAuthoring`
# surface; per-session access moved to the `sessionAccess` Remote.
#
# Admin-surface rework (0.1.2, ApiProxy removed):
#   * ``llm.models``    -> ``session/modelCatalog`` (host-wide; {default,
#     routableProviders, groups, failures}); the group/model shape is preserved.
#   * ``agentPreset.*``  -> the mtil custom ``presetWorkspace`` Remote (fork), which
#     wraps the stock agent-presets roster AND provisions a per-preset workspace so
#     ``copy`` still answers ``{agentPreset, workspace}`` and skill authoring keeps
#     its ``workspace_id``. Every method takes one ``request`` object. There is NO
#     metadata-push (former ``agentPreset.update``) nor ``disabled`` round-trip —
#     that push is dropped and archiving stays a local-mirror concern.
#   * ``llm.providers`` and ``host.describe`` have NO 0.1.2 equivalent; the admin
#     models that consumed them are degraded (derive from modelCatalog / session
#     list) rather than calling a dead endpoint.
_ENDPOINT_MAP = {
    'skill.list': 'skills/list',
    'skill.listWorkspace': 'skillAuthoring/listWorkspace',
    'skill.read': 'skillAuthoring/read',
    'skill.write': 'skillAuthoring/write',
    'skill.remove': 'skillAuthoring/remove',
    'session.setAccess': 'sessionAccess/set',
    'session.getAccess': 'sessionAccess/get',
    # Host-wide model catalog (replaces the deleted ``llm.models``).
    'session.modelCatalog': 'session/modelCatalog',
    # mtil custom preset Remote (fork): roster + per-preset workspace provisioning.
    'agentPreset.list': 'presetWorkspace/list',
    'agentPreset.read': 'presetWorkspace/read',
    'agentPreset.copy': 'presetWorkspace/copy',
    'agentPreset.remove': 'presetWorkspace/remove',
}


def _harness_endpoint(method):
    """Map a legacy dotted method to its 0.1.2 ``<namespace>/<method>`` endpoint."""
    return _ENDPOINT_MAP.get(method) or method.replace('.', '/', 1)


# Argument shaping for the 0.1.2 Typert gateway. The gateway
# (``packages/api/gateway``) requires ``payload.args`` to be a PLAIN OBJECT keyed
# by the target method's exact parameter names — an array is rejected, and the
# key set must match the ``@Remote`` signature. Three shapes cover every endpoint
# the module calls:
#   * no-arg methods            -> ``{}``
#   * named/multi-param methods -> the flat payload spread as named args (the
#     payload's keys already ARE the parameter names)
#   * single-``request``-param  -> ``{"request": payload}`` (the default; every
#     mtil custom controller — skillAuthoring / sessionAccess / presetWorkspace /
#     workspace — takes one ``request`` object)
# ``session/list`` is the one stock single-object method whose parameter is named
# ``_request`` rather than ``request``.

# Endpoints whose ``@Remote`` method takes no parameter.
_ARGS_NOARG = frozenset({
    'session/modelCatalog',
    'session/canOpenWorkspacePath',
    'settings/describe',
    'settings/openSettingsDocument',
    'settings/canOpenAgentPresetDirectory',
})
# Endpoints whose ``@Remote`` method takes named positional parameters; the flat
# payload's keys already are those parameter names.
_ARGS_SPREAD = frozenset({
    'credentials/describe',
    'credentials/set',
    'credentials/unset',
    'settings/update',
    'settings/replace',
    'settings/mutate',
})
# Single-object endpoints whose sole parameter is not named ``request``.
_ARGS_WRAP_KEY = {
    'session/list': '_request',
}


def _remote_args(endpoint, payload):
    """Shape ``payload`` into the gateway's ``payload.args`` object for ``endpoint``.

    The gateway keys ``args`` by parameter name, so a single-object custom
    controller call becomes ``{"request": payload}``, a no-arg call becomes
    ``{}``, and a named-parameter stock call spreads the flat payload as-is.

    :param str endpoint: the resolved ``<namespace>/<method>`` endpoint.
    :param dict payload: the business payload the model passed to :meth:`_rpc`.
    :returns: the ``args`` plain object keyed by the method's parameter names.
    :rtype: dict
    """
    if endpoint in _ARGS_NOARG:
        return {}
    if endpoint in _ARGS_SPREAD:
        return dict(payload or {})
    return {_ARGS_WRAP_KEY.get(endpoint, 'request'): payload or {}}

# Ticket wire rules — MUST match @deepseek-ai/dsh-user-ticket and the harness.
TICKET_VERSION = 'v1'
MIN_TICKET_SECRET_LENGTH = 32
DEFAULT_TICKET_TTL_SECONDS = 600


class HarnessClient(models.AbstractModel):
    """Stateless helper that talks to the harness ``/api`` gateway."""

    _name = 'npei.agent.harness.client'
    _description = 'DeepSeek Harness HTTP Client'

    @api.model
    def _get_connection(self):
        """Return ``(base_url, token)`` for the harness, or fail loud.

        Reads the secret via ``sudo()`` because ``ir.config_parameter`` is
        admin-only. Raises :class:`~odoo.exceptions.UserError` when either the
        base URL or the token is unset — callers must translate that into a 502
        for HTTP contexts.
        """
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
    def _auth_headers(self, token):
        """Build the Bearer + JSON headers for a harness call."""
        return {
            'Authorization': 'Bearer %s' % token,
            'Content-Type': 'application/json',
        }

    # ------------------------------------------------------------------
    # SPA user-ticket minting (for the MTIL Flask get_config_v2 gate)
    # ------------------------------------------------------------------
    @api.model
    def _b64url_nopad(self, raw):
        """base64url-encode without ``=`` padding (matches JS ``base64url``)."""
        return base64.urlsafe_b64encode(raw).rstrip(b'=').decode('ascii')

    @api.model
    def mint_user_ticket(self, user_id, ttl_seconds=DEFAULT_TICKET_TTL_SECONDS):
        """Mint a ``v1`` harness user-ticket for ``user_id``.

        Signs ``{"u": str(user_id), "exp": <unix>}`` with HMAC-SHA256 over the
        shared secret in ``ir.config_parameter`` (``npei_agent_harness.ticket_secret``)
        — the same value the harness verifies with. ``u`` MUST be the identifier
        the session ACL is keyed by: :meth:`NpeiAgentSession._push_access` pushes
        ``str(res.users.id)``, so pass a ``res.users`` id.

        :meth:`api_get_config_v2` wraps this for the MTIL Flask gate, which
        delivers the returned ticket to the browser as the HttpOnly ``dsh_ticket``
        cookie. The secret never leaves Odoo/the gate.

        :param user_id: the ``res.users`` id to sign into the ticket.
        :param int ttl_seconds: lifetime; keep it under the harness max-TTL guard.
        :returns: ``(ticket, expires_at)`` — the ``v1.<payload>.<mac>`` string and
            the absolute Unix-second expiry.
        :raises UserError: when the secret is unset or below the harness minimum.
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

        The XML-RPC entry the MTIL Flask ``get_config_v2`` gate calls (server-side,
        service account). Returns the MTIL envelope ``{status, message, datas}``;
        the Flask layer moves ``datas.ticket`` into the HttpOnly ``dsh_ticket``
        cookie and keeps only ``expires_at`` in the body. ``user_id`` is the
        ``res.users`` id the gate resolved from the Odoo session — the id the
        session ACL is keyed by.

        :param user_id: the ``res.users`` id to sign into the ticket.
        :returns: ``{'status': True, 'message': '', 'datas': {'ticket', 'expires_at'}}``.
        :raises UserError: when the ticket secret is unset or too short (surfaces
            to the gate as an XML-RPC fault it maps to a failure envelope).
        """
        ticket, expires_at = self.mint_user_ticket(user_id)
        return {
            'status': True,
            'message': '',
            'datas': {'ticket': ticket, 'expires_at': expires_at},
        }

    @api.model
    def _rpc(self, method, payload=None):
        """Call one unary harness method and return ``result.value``.

        Wraps ``payload`` in the ``client-request`` envelope, mints a fresh
        ``rpcId``, POSTs to ``<base_url>/api/<method>`` and unwraps the
        ``server-response``. Business errors (``result.ok == false``) and
        transport failures both raise :class:`~odoo.exceptions.UserError`.

        :param str method: an ``RpcMethodMap`` key, e.g. ``agentPreset.list``.
        :param dict payload: the business payload (``RequestPayload<K>``).
        :returns: the ``result.value`` dict (``ResponseValue<K>``).
        """
        base_url, token = self._get_connection()
        # 0.1.2 Remote wire: endpoint <namespace>/<method>, business payload carried
        # under payload.args as a PLAIN OBJECT keyed by the method's parameter names
        # (see _remote_args; the gateway rejects an array or a wrong key set).
        endpoint = _harness_endpoint(method)
        envelope = {
            'type': 'client-request',
            'rpcId': str(uuid.uuid4()),
            'method': endpoint,
            'payload': {'args': _remote_args(endpoint, payload)},
        }
        url = '%s/api/%s' % (base_url, endpoint)
        try:
            response = requests.post(
                url,
                data=json.dumps(envelope),
                headers=self._auth_headers(token),
                timeout=HARNESS_RPC_TIMEOUT,
            )
        except requests.RequestException as exc:
            _logger.warning("Harness RPC %s unreachable: %s", method, exc)
            raise UserError(_("Cannot reach the DeepSeek Harness: %s") % exc)

        if response.status_code != 200:
            raise UserError(_(
                "Harness call %(method)s failed (HTTP %(status)s): %(body)s",
                method=method,
                status=response.status_code,
                body=response.text[:500],
            ))
        try:
            body = response.json()
        except ValueError:
            raise UserError(_(
                "Harness call %(method)s returned a non-JSON body.",
                method=method,
            ))

        result = (body or {}).get('result') or {}
        if not result.get('ok', False):
            error = result.get('error') or {}
            raise UserError(_(
                "Harness call %(method)s returned an error: %(error)s",
                method=method,
                error=error.get('code') or json.dumps(error),
            ))
        return result.get('value') or {}
