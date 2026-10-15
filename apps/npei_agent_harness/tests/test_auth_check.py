# -*- coding: utf-8 -*-
"""``GET /api/mtil/auth_check``: the reverse proxy's login verdict.

nginx admits a ``/mtilai2/`` request only on a 2xx from this route, so the
three answers are the whole contract: anonymous 401, signed in without MTIL
User 403 (portal users included), MTIL User or Manager 204.
"""
from odoo.tests import HttpCase, new_test_user, tagged

AUTH_CHECK = '/api/mtil/auth_check'


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
