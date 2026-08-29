# -*- coding: utf-8 -*-
"""HTTP gateway between the browser SPA and the DeepSeek Harness.

The SPA (served same-origin at ``/mtilai``) only ever calls Odoo. Odoo resolves
the caller from the Odoo session cookie, enforces the session ACL, then forwards
to the harness authenticated as the operator (the ``X-DSH-Operator`` secret; see
``harness_client._auth_headers``), keeping the legacy Bearer token alongside.
Neither the secret nor the token ever reaches the browser.

Endpoints (all under ``/api/mtil``):

* ``POST /api/mtil/get_config`` — auth probe; 401 when anonymous, 200 with the
  user identity otherwise. Never returns the harness token.
* ``POST /api/mtil/session_access`` — per-session ACL probe the SPA runs
  before opening ``/s/<id>``; 401 when anonymous, else ``{"allowed": bool}``.
* ``POST /api/mtil/rpc/<method>`` — unary RPC proxy; enforces the ACL for
  session-scoped calls, forwards the ``client-request`` envelope verbatim, and
  relays the harness ``server-response`` verbatim.
* ``GET /api/mtil/download/<kind>`` — file download proxy (``session.export``,
  ``workspace.file``); same ACL, streams the bytes back.
* ``GET|POST /api/mtil/events/<channel>`` — DEFERRED realtime mux stub (501).

Design notes:

* All routes use ``type='http'`` with ``auth='public'`` and a manual public-user
  check so the API can return a true JSON 401/403 instead of Odoo's login
  redirect (which ``auth='user'`` would trigger) or the JSON-RPC 200 wrapper
  that ``type='json'`` forces. Odoo 17 has no ``auth='bearer'``.
* ``csrf=False`` because these are cookie-authenticated same-origin API calls,
  not form posts. Odoo's session cookie is ``SameSite=Lax``, which blocks the
  cross-site POSTs CSRF would otherwise guard; the deployment is same-origin by
  assumption (nginx maps ``/web`` + ``/api/mtil/*`` to Odoo, ``/mtilai`` to the
  SPA), so no CORS headers are emitted.
"""
import json
import logging

import requests
from werkzeug.wrappers import Response

from odoo import http
from odoo.http import request
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

# Payload keys that identify a harness session for the ACL check. Remote-gateway
# methods nest the id under ``args.request`` (e.g. messageFeedback/*).
SESSION_ID_KEYS = ('sessionId', 'parentSessionId', 'childSessionId')

# Seconds before a proxied harness call is abandoned.
PROXY_TIMEOUT = 60

# Bytes per chunk when streaming a download back to the browser.
DOWNLOAD_CHUNK_SIZE = 64 * 1024


class MtilAgentController(http.Controller):
    """Odoo-side gateway to the DeepSeek Harness ``/api``."""

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _json(self, data, status=200):
        """Build a JSON HTTP response with an explicit status code."""
        return request.make_response(
            json.dumps(data),
            headers=[('Content-Type', 'application/json')],
            status=status,
        )

    def _current_user(self):
        """Return the resolved user, or ``None`` when the caller is anonymous."""
        user = request.env.user
        if not user or user._is_public():
            return None
        return user

    def _connection(self):
        """Return ``(base_url, token)`` or ``None`` when unconfigured."""
        try:
            return request.env['npei.agent.harness.client'].sudo()._get_connection()
        except UserError:
            return None

    def _session_ids_from_body(self, raw):
        """Extract every harness session id referenced by a request body.

        Understands both the flat ``RpcMethodMap`` payload
        (``payload.sessionId``) and the remote-gateway shape
        (``payload.args.request.sessionId``). Returns a list (possibly empty);
        a body without any session id is treated as a non-session-scoped call.
        """
        try:
            body = json.loads(raw or b'{}')
        except (ValueError, TypeError):
            return []
        if not isinstance(body, dict):
            return []
        payload = body.get('payload')
        if not isinstance(payload, dict):
            return []
        candidates = [payload]
        args = payload.get('args')
        if isinstance(args, dict) and isinstance(args.get('request'), dict):
            candidates.append(args['request'])
        ids = []
        for scope in candidates:
            for key in SESSION_ID_KEYS:
                value = scope.get(key)
                if isinstance(value, str) and value:
                    ids.append(value)
        return ids

    def _acl_denied(self, session_ids, user):
        """Return True if ``user`` may not access any referenced session."""
        Session = request.env['npei.agent.session'].sudo()
        return any(
            not Session._user_can_access(session_id, user)
            for session_id in session_ids
        )

    # ------------------------------------------------------------------
    # Auth probe
    # ------------------------------------------------------------------
    @http.route('/api/mtil/get_config', type='http', auth='public',
                methods=['POST'], csrf=False)
    def get_config(self, **kwargs):
        """Report whether the caller is a logged-in Odoo user.

        Relies on Odoo having already resolved the session cookie into
        ``request.env.user``. Returns 401 for anonymous callers so the SPA can
        show its login/denied screen; 200 with the user identity otherwise.
        The harness token is never included.
        """
        user = self._current_user()
        if user is None:
            return self._json({'authenticated': False}, status=401)
        return self._json({
            'authenticated': True,
            'user': {
                'id': user.id,
                'name': user.name,
                'login': user.login,
            },
            'harness': {'basePath': '/api'},
        }, status=200)

    # ------------------------------------------------------------------
    # Per-session access probe
    # ------------------------------------------------------------------
    @http.route('/api/mtil/session_access', type='http', auth='public',
                methods=['POST'], csrf=False)
    def session_access(self, **kwargs):
        """Report whether the caller may open one harness session.

        The SPA calls this before rendering ``/s/<sessionId>``. Body:
        ``{"sessionId": "session-..."}`` (``session_id`` also accepted).
        Returns 401 when anonymous, otherwise ``{"allowed": true|false}``. The
        body is parsed defensively so malformed JSON answers ``allowed=false``
        rather than 500, and an unmapped id is denied to non-managers (the same
        fail-closed rule the proxy enforces).
        """
        user = self._current_user()
        if user is None:
            return self._json({'authenticated': False}, status=401)

        session_id = None
        try:
            body = json.loads(request.httprequest.get_data() or b'{}')
            if isinstance(body, dict):
                value = body.get('sessionId') or body.get('session_id')
                if isinstance(value, str) and value:
                    session_id = value
        except (ValueError, TypeError):
            session_id = None

        allowed = bool(session_id) and not self._acl_denied([session_id], user)
        return self._json({'allowed': allowed}, status=200)

    # ------------------------------------------------------------------
    # Unary RPC proxy
    # ------------------------------------------------------------------
    @http.route('/api/mtil/rpc/<path:method>', type='http', auth='public',
                methods=['POST'], csrf=False)
    def rpc_proxy(self, method, **kwargs):
        """Proxy one unary harness call, enforcing the session ACL.

        ``<method>`` is an ``RpcMethodMap`` key (``session.prompt``) or a remote
        method (``messageFeedback/list``); the ``<path:...>`` converter keeps
        the ``/``. The raw ``client-request`` envelope is forwarded verbatim and
        the harness ``server-response`` is relayed verbatim, so the RPC-result
        envelope and business error codes survive unchanged.
        """
        user = self._current_user()
        if user is None:
            return self._json({'authenticated': False}, status=401)

        raw = request.httprequest.get_data()
        session_ids = self._session_ids_from_body(raw)
        if session_ids and self._acl_denied(session_ids, user):
            return self._json(
                {'error': 'forbidden',
                 'message': 'Not allowed to access this session.'},
                status=403,
            )

        connection = self._connection()
        if connection is None:
            return self._json(
                {'error': 'harness-not-configured',
                 'message': 'Harness base URL or token is unset.'},
                status=502,
            )
        base_url, token = connection

        url = '%s/api/%s' % (base_url, method)
        try:
            upstream = requests.post(
                url,
                data=raw,
                headers=request.env['npei.agent.harness.client'].sudo()._auth_headers(token),
                timeout=PROXY_TIMEOUT,
            )
        except requests.RequestException as exc:
            _logger.warning("Harness proxy %s unreachable: %s", method, exc)
            return self._json(
                {'error': 'harness-unreachable', 'message': str(exc)},
                status=502,
            )

        content_type = upstream.headers.get('Content-Type', 'application/json')
        return request.make_response(
            upstream.content,
            headers=[('Content-Type', content_type)],
            status=upstream.status_code,
        )

    # ------------------------------------------------------------------
    # Download proxy
    # ------------------------------------------------------------------
    @http.route('/api/mtil/download/<path:kind>', type='http', auth='public',
                methods=['GET'], csrf=False)
    def download_proxy(self, kind, **params):
        """Proxy a harness file download (``session.export``/``workspace.file``).

        Both carry ``sessionId`` in the query string, so the ACL applies. The
        upstream bytes stream back with the harness ``Content-Type`` and
        ``Content-Disposition`` preserved; harness-side rejections (403 for
        symlink escape or executable files, 404, 400) relay verbatim.
        """
        user = self._current_user()
        if user is None:
            return self._json({'authenticated': False}, status=401)

        session_id = params.get('sessionId')
        if not session_id or self._acl_denied([session_id], user):
            return self._json(
                {'error': 'forbidden',
                 'message': 'Not allowed to access this session.'},
                status=403,
            )

        connection = self._connection()
        if connection is None:
            return self._json(
                {'error': 'harness-not-configured',
                 'message': 'Harness base URL or token is unset.'},
                status=502,
            )
        base_url, token = connection

        url = '%s/api/%s' % (base_url, kind)
        download_headers = {'Authorization': 'Bearer %s' % token}
        download_headers.update(
            request.env['npei.agent.harness.client'].sudo()._operator_headers())
        try:
            upstream = requests.get(
                url,
                params=request.httprequest.args,
                headers=download_headers,
                stream=True,
                timeout=PROXY_TIMEOUT,
            )
        except requests.RequestException as exc:
            _logger.warning("Harness download %s unreachable: %s", kind, exc)
            return self._json(
                {'error': 'harness-unreachable', 'message': str(exc)},
                status=502,
            )

        headers = [
            (name, upstream.headers[name])
            for name in ('Content-Type', 'Content-Disposition', 'Content-Length')
            if name in upstream.headers
        ]
        return Response(
            upstream.iter_content(chunk_size=DOWNLOAD_CHUNK_SIZE),
            status=upstream.status_code,
            headers=headers,
        )

    # ------------------------------------------------------------------
    # Realtime mux — DEFERRED (see README)
    # ------------------------------------------------------------------
    @http.route(['/api/mtil/events/<string:channel>'], type='http',
                auth='public', csrf=False)
    def events_stub(self, channel, **kwargs):
        """Stub for the deferred realtime event proxy.

        ``events.mux`` emits *every* session's events, so a per-user ACL
        requires Odoo to proxy and FILTER the stream down to the sessions the
        caller may access — a separate design task. Two candidate approaches are
        described in the README. Until then this returns 501.
        """
        return self._json(
            {'error': 'not-implemented',
             'message': 'Realtime event proxy is deferred; see the module README.'},
            status=501,
        )
