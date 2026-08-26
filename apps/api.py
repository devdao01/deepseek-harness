# -*- coding: utf-8 -*-
"""MTIL ``get_config_v2`` — copy-paste reference for the npei_api Flask app.

npei_api reaches Odoo ONLY over XML-RPC (``config/oorpc.py``), and every business
decision lives in an Odoo model; the Flask layer stays thin. ``get_config_v2``
mirrors the working ``get_config`` and adds ONE thing: the harness user-ticket.

This file is a REFERENCE, not a runnable module: each block below carries the
name of the file it belongs in, and uses names (``ns``, ``NPEIBase``,
``NanoPham``, ``sys``, ``LOG``, ``request``) that already exist in those files.
Copy each block into the matching file:

  * controllers/mtil.py  — POST /api/mtil/get_config_v2 route + ticket cookie
  * models/mtil_model.py — NanoPham.api_get_config_v2 (validate session, oorpc)
  * config/oorpc.py      — OpenObjectRPC.api_get_config_v2 (XML-RPC entry)

The ticket is MINTED IN ODOO, never in Flask, and ONLY through ``npei.agent.*``
models (``npei.ai`` is a different, unrelated object — do not use it). The gate
entry ``npei.agent.harness.client.api_get_config_v2(user_id)`` lives in
``apps/npei_agent_harness`` (which owns the ticket secret in
``ir.config_parameter``); it mints and returns the envelope. Flask only moves the
returned ticket into an HttpOnly cookie and drops it from the JSON body, so page
scripts never see the credential.

Flow:
  browser POST /api/mtil/get_config_v2   (Odoo session cookie)
    -> NanoPham.validate_session          (Odoo /api/check_session) -> session_info
    -> user_id from session_info
    -> oorpc.api_get_config_v2 -> npei.agent.harness.client.api_get_config_v2 (mints v1.<...>)
    -> controller: Set-Cookie: dsh_ticket=<ticket>; body keeps only expires_at
"""

# ============================================================================ #
# controllers/mtil.py
# ============================================================================ #
# Add these imports at the top of controllers/mtil.py (os/time are new there):
import os
import time
from flask import jsonify, make_response

# --- ticket cookie config + helpers (put after `ns = api.namespace(...)`) ---- #
#: Cookie carrying the harness ticket. HttpOnly so page scripts cannot read it;
#: Path=/api so it rides both /api/mtil/* and the harness /api; Domain=.mtil.vn
#: (env) so it reaches the harness subdomain (chat.mtilai.mtil.vn <-> harness).
TICKET_COOKIE_NAME = 'dsh_ticket'
TICKET_COOKIE_PATH = '/api'
# Env overrides, else the hardcoded default '.mtil.vn'. Set the env to '' to force
# host-only (drop Domain). Secure defaults True; set the env to '0' for a LAN over
# plain HTTP.
TICKET_COOKIE_DOMAIN = os.environ.get('DSH_TICKET_COOKIE_DOMAIN', '.mtil.vn') or None
TICKET_COOKIE_SECURE = os.environ.get('DSH_TICKET_COOKIE_SECURE', '1') not in ('0', 'false', 'False', '')


def _set_ticket_cookie(resp, ticket, expires_at):
    """Attach the HttpOnly ticket cookie; max_age derived from expires_at (unix s)."""
    max_age = max(0, int(expires_at) - int(time.time())) if expires_at else None
    resp.set_cookie(
        TICKET_COOKIE_NAME, ticket,
        max_age=max_age, httponly=True, secure=TICKET_COOKIE_SECURE,
        samesite='Strict', path=TICKET_COOKIE_PATH, domain=TICKET_COOKIE_DOMAIN,
    )


def _clear_ticket_cookie(resp):
    """Drop a stale ticket so a rejected caller keeps no credential."""
    resp.delete_cookie(TICKET_COOKIE_NAME, path=TICKET_COOKIE_PATH, domain=TICKET_COOKIE_DOMAIN)


# --- the route (add beside GetConfig in controllers/mtil.py) ---------------- #
@ns.route('/get_config_v2')
class GetConfigV2(NPEIBase):
    @ns.response(200, 'Nhận dữ liệu thành công.')
    @ns.response(401, 'Unauthorized')
    @ns.response(503, 'Lỗi Api Server.')
    def post(self):
        # Same shape as GetConfig; on success Odoo already minted a ticket in
        # datas — move it into the HttpOnly cookie and leave only expires_at in
        # the body (the SPA schedules its refresh from expires_at, never reads
        # the cookie).
        try:
            npei = NanoPham()
            res = npei.api_get_config_v2()
            if res.get('status', False):
                datas = res.get('datas', {}) or {}
                ticket = datas.pop('ticket', '')  # ticket leaves the body -> cookie only
                resp = make_response(jsonify(res), 200)
                if ticket:
                    _set_ticket_cookie(resp, ticket, datas.get('expires_at'))
                return resp
            else:
                code = 401 if res.get('error_code', '') == 'UNAUTHORIZED' else 201
                resp = make_response(jsonify(res), code)
                _clear_ticket_cookie(resp)
                return resp
        except Exception as exc:
            mess = 'GetConfigV2 Loi tai line ' + str(sys.exc_info()[-1].tb_lineno) + ': ' + str(exc)
            LOG.info(mess)
            return make_response(jsonify({'status': False, 'message': mess, 'datas': {}}), 201)


# ============================================================================ #
# models/mtil_model.py   (method on class NanoPham)
# ============================================================================ #
def api_get_config_v2(self):
    # Mirror api_get_config: validate the Odoo session, then let npei_agent_harness
    # mint the ticket for the logged-in user. The user id comes from the
    # /api/check_session result (session_info) — the same call get_config uses.
    try:
        value_json = request.json or {}
        session_id, cids = self._get_session_and_cids()
        session_info = self.validate_session(session_id)
        if not session_info:
            return {
                'status': False,
                'error_code': 'UNAUTHORIZED',
                'message': 'Chưa Đăng nhập',
                'datas': {}
            }  # error_code dùng ở controller
        # res.users id keyed into the harness ACL. Adjust the key to your
        # /api/check_session result shape (e.g. 'uid' / 'user_id').
        user_id = session_info.get('uid') or session_info.get('user_id')
        if not user_id:
            return {
                'status': False,
                'error_code': 'UNAUTHORIZED',
                'message': 'Chưa Đăng nhập',
                'datas': {}
            }
        res = self.oorpc.api_get_config_v2(user_id)
        if res:
            return res
        return {
            'status': False,
            'error_code': 'UNAUTHORIZED',
            'message': 'Không thể xem Config',
            'datas': {}
        }
    except Exception as exc:
        mess = 'api_get_config_v2 Loi tai line ' + str(sys.exc_info()[-1].tb_lineno) + ': ' + str(exc)
        LOG.info(mess)
        return {'status': False, 'message': mess, 'datas': {}}


# ============================================================================ #
# config/oorpc.py   (method on class OpenObjectRPC, beside api_get_config)
# ============================================================================ #
def api_get_config_v2(self, user_id):
    return self._sock.execute(self._dbname, self._uid, self._password, 'npei.agent.harness.client', 'api_get_config_v2', user_id)


# ============================================================================ #
# Odoo side — already implemented in apps/npei_agent_harness (no npei.ai)
# ============================================================================ #
# npei.agent.harness.client.api_get_config_v2(user_id) mints the ticket and
# returns {'status': True, 'datas': {'ticket': 'v1...', 'expires_at': <unix>}}.
# It reads the secret from ir.config_parameter('npei_agent_harness.ticket_secret')
# via mint_user_ticket(). See apps/npei_agent_harness/models/harness_client.py.
