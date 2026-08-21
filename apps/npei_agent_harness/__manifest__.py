# -*- coding: utf-8 -*-
{
    'name': 'NPEI Agent Harness',
    'version': '17.0.1.0.0',
    'summary': 'Odoo gateway and session ACL for the DeepSeek Harness backend',
    'description': """
NPEI Agent Harness
==================

Odoo is the single gateway between the browser SPA and the DeepSeek Harness
backend. The SPA only ever talks to Odoo; Odoo injects the harness Bearer token
server-side and proxies the request. The harness token never reaches the browser.

This module provides:

* Harness connection settings (base URL + Bearer token) via ``res.config.settings``.
* Odoo-side session ACL (``npei.agent.session``) mapping a harness session id to
  the ``res.users`` allowed to use it.
* Preset and skill management mirrors with a sync-from-harness action.
* HTTP proxy controllers for unary RPC and file downloads, enforcing the ACL
  before forwarding.
""",
    'author': 'NPEI / MTIL',
    'website': 'https://mtil.mtil.vn',
    'license': 'LGPL-3',
    'category': 'Tools',
    'depends': ['base', 'web'],
    'data': [
        'security/npei_agent_harness_groups.xml',
        'security/ir_rule.xml',
        'security/ir.model.access.csv',
        'views/npei_agent_session_views.xml',
        'views/npei_agent_preset_views.xml',
        'views/npei_agent_skill_views.xml',
        'views/res_config_settings_views.xml',
        'views/npei_agent_harness_menus.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
}
