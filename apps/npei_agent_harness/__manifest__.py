# -*- coding: utf-8 -*-
{
    'name': 'NPEI Agent Harness',
    'version': '17.0.1.2.0',
    'summary': 'Cổng Odoo và ACL phiên làm việc cho backend DeepSeek Harness',
    'description': """
NPEI Agent Harness
==================

Odoo là cổng kết nối duy nhất giữa SPA trình duyệt và backend DeepSeek Harness.
SPA chỉ giao tiếp với Odoo; Odoo trao đổi launch token của harness lấy cookie
phiên đã ký phía máy chủ và proxy yêu cầu. Token không bao giờ đến trình duyệt.

Module này cung cấp:

* Cài đặt kết nối Harness (URL cơ sở + launch token) qua ``res.config.settings``.
* ACL phiên phía Odoo (``npei.agent.session``) ánh xạ mã phiên harness với
  ``res.users`` được phép sử dụng.
* Phản chiếu quản lý preset và kỹ năng với action đồng bộ từ harness.
* Controller proxy HTTP cho RPC unary và tải file, thực thi ACL trước khi chuyển tiếp.
""",
    'author': 'NPEI / MTIL',
    'website': 'https://mtil.mtil.vn',
    'license': 'LGPL-3',
    'category': 'Tools',
    'depends': ['base', 'mail', 'web', 'npei_base'],
    'data': [
        'security/npei_agent_harness_groups.xml',
        'security/ir_rule.xml',
        'security/ir.model.access.csv',
        'data/provider_route_templates.xml',
        'views/npei_agent_provider_route_template_views.xml',
        'views/npei_agent_session_views.xml',
        'views/npei_agent_preset_views.xml',
        'views/npei_agent_tool_views.xml',
        'views/npei_agent_skill_views.xml',
        'views/npei_agent_credential_views.xml',
        'views/npei_agent_provider_views.xml',
        'views/npei_agent_model_views.xml',
        'views/npei_agent_setting_views.xml',
        'views/res_config_settings_views.xml',
        'wizard/npei_discover_models_views.xml',
        'wizard/npei_host_status_views.xml',
        'wizard/npei_provider_route_views.xml',
        'views/npei_agent_harness_menus.xml',
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
}
