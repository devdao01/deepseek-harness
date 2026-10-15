# -*- coding: utf-8 -*-
"""The SPA gates: ``GET /api/mtil/auth_check`` and ``POST /api/mtil/get_config_v2``.

nginx admits a ``/mtilai2/`` request only on a 2xx from ``auth_check``, and the
SPA renders only after ``get_config_v2`` answers 200 and installs the ticket
cookie. Both share one verdict: anonymous 401 (an unknown or logged-out Odoo
session is anonymous), signed in without MTIL User 403 (portal users
included), MTIL User or Manager admitted.
"""
import base64
import hashlib
import hmac
import json

from odoo.tests import HttpCase, new_test_user, tagged

AUTH_CHECK = '/api/mtil/auth_check'
GET_CONFIG_V2 = '/api/mtil/get_config_v2'
TICKET_SECRET = 'ticket-secret-for-tests-0123456789abcdef'
GATE_ENVELOPE = json.dumps({'jsonrpc': '2.0', 'method': 'call', 'params': {}})


def _b64url_decode(text):
    return base64.urlsafe_b64decode(text + '=' * (-len(text) % 4))


@tagged('post_install', '-at_install')
class TestAuthCheck(HttpCase):
    def test_anonymous_caller_is_refused_with_401(self):
        response = self.url_open(AUTH_CHECK)
        self.assertEqual(response.status_code, 401)

    def test_signed_in_user_outside_the_group_is_refused_with_403(self):
        new_test_user(self.env, login='plain-internal', password='plain-internal-pw', groups='base.group_user')
        new_test_user(self.env, login='portal-customer', password='portal-customer-pw', groups='base.group_portal')
        for login in ('plain-internal', 'portal-customer'):
            self.authenticate(login, '%s-pw' % login)
            response = self.url_open(AUTH_CHECK)
            self.assertEqual(response.status_code, 403, login)

    def test_mtil_user_and_manager_are_admitted_with_204(self):
        new_test_user(self.env, login='mtil-user', password='mtil-user-pw',
                      groups='npei_agent_harness.group_npei_agent_user')
        new_test_user(self.env, login='mtil-manager', password='mtil-manager-pw',
                      groups='npei_agent_harness.group_npei_agent_manager')
        for login in ('mtil-user', 'mtil-manager'):
            self.authenticate(login, '%s-pw' % login)
            response = self.url_open(AUTH_CHECK)
            self.assertEqual(response.status_code, 204, login)
            self.assertEqual(response.content, b'')


@tagged('post_install', '-at_install')
class TestGetConfigV2(HttpCase):
    def setUp(self):
        super().setUp()
        self.env['ir.config_parameter'].sudo().set_param('npei_agent_harness.ticket_secret', TICKET_SECRET)
        self.mtil_user = new_test_user(self.env, login='gate-user', password='gate-user-pw',
                                       groups='npei_agent_harness.group_npei_agent_user')

    def _gate(self):
        return self.url_open(GET_CONFIG_V2, data=GATE_ENVELOPE, headers={'Content-Type': 'application/json'})

    def _assert_refused(self, response, status, error_code):
        self.assertEqual(response.status_code, status)
        body = response.json()
        self.assertEqual((body['status'], body['error_code'], body['datas']), (False, error_code, {}))
        cleared = response.headers.get('Set-Cookie', '')
        self.assertIn('mtil-ticket=;', cleared)
        self.assertNotIn('mtil-ticket', self.opener.cookies.get_dict())

    def test_anonymous_caller_gets_401_and_no_ticket(self):
        self._assert_refused(self._gate(), 401, 'UNAUTHORIZED')

    def test_unknown_or_logged_out_session_counts_as_anonymous(self):
        self.opener.cookies.set('session_id', 'Z' * 84)
        self._assert_refused(self._gate(), 401, 'UNAUTHORIZED')
        self.authenticate('gate-user', 'gate-user-pw')
        self.assertEqual(self._gate().status_code, 200)
        self.url_open('/web/session/logout')
        self._assert_refused(self._gate(), 401, 'UNAUTHORIZED')

    def test_signed_in_user_outside_the_group_gets_403(self):
        new_test_user(self.env, login='gate-portal', password='gate-portal-pw', groups='base.group_portal')
        self.authenticate('gate-portal', 'gate-portal-pw')
        self._assert_refused(self._gate(), 403, 'FORBIDDEN')

    def test_unusable_ticket_secret_gets_503(self):
        self.env['ir.config_parameter'].sudo().set_param('npei_agent_harness.ticket_secret', 'too-short')
        self.authenticate('gate-user', 'gate-user-pw')
        self._assert_refused(self._gate(), 503, 'TICKET_SECRET_UNSET')

    def test_mtil_user_gets_the_signed_ticket_only_as_an_httponly_cookie(self):
        self.authenticate('gate-user', 'gate-user-pw')
        response = self._gate()
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body['status'])
        self.assertEqual(set(body['datas']), {'expires_at'})

        set_cookie = response.headers['Set-Cookie']
        self.assertTrue(set_cookie.startswith('mtil-ticket=v1.'), set_cookie)
        attributes = {part.strip().split('=')[0].lower() for part in set_cookie.split(';')[1:]}
        self.assertTrue({'httponly', 'path', 'samesite', 'max-age'} <= attributes, set_cookie)
        self.assertNotIn('domain', attributes)
        self.assertIn('SameSite=Strict', set_cookie)

        ticket = self.opener.cookies.get('mtil-ticket')
        version, payload, mac = ticket.split('.')
        expected_mac = hmac.new(TICKET_SECRET.encode(), ('%s.%s' % (version, payload)).encode(), hashlib.sha256).digest()
        self.assertTrue(hmac.compare_digest(_b64url_decode(mac), expected_mac))
        claims = json.loads(_b64url_decode(payload))
        self.assertEqual(claims, {'u': str(self.mtil_user.id), 'exp': body['datas']['expires_at']})


@tagged('post_install', '-at_install')
class TestTicketMintingIsNotRpc(HttpCase):
    """A ticket for any user id, ``*`` included, is a harness credential."""

    def test_no_user_can_mint_a_ticket_over_rpc(self):
        self.env['ir.config_parameter'].sudo().set_param('npei_agent_harness.ticket_secret', TICKET_SECRET)
        new_test_user(self.env, login='rpc-plain', password='rpc-plain-pw', groups='base.group_user')
        new_test_user(self.env, login='rpc-manager', password='rpc-manager-pw',
                      groups='npei_agent_harness.group_npei_agent_manager')
        for login in ('rpc-plain', 'rpc-manager'):
            self.authenticate(login, '%s-pw' % login)
            for method in ('_mint_user_ticket', 'mint_user_ticket', 'api_get_config_v2'):
                response = self.url_open('/web/dataset/call_kw', data=json.dumps({
                    'jsonrpc': '2.0', 'method': 'call', 'params': {
                        'model': 'npei.agent.harness.client', 'method': method, 'args': ['*'], 'kwargs': {},
                    },
                }), headers={'Content-Type': 'application/json'})
                body = response.json()
                self.assertNotIn('result', body, (login, method))
                self.assertIn('error', body, (login, method))
