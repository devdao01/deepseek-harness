# -*- coding: utf-8 -*-
"""Harness connection settings.

Surfaces the two ``ir.config_parameter`` keys the gateway needs through the
standard Settings screen. The ``config_parameter`` attribute makes each field
read from and write to the parameter store transparently.
"""
from odoo import _, fields, models
from odoo.exceptions import AccessError

# Records seeded by this data file are preserved by Clear Data.
TEMPLATE_DATA_MODULE = 'npei_agent_harness'
TEMPLATE_MODEL = 'npei.agent.provider.route.template'


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    npei_harness_base_url = fields.Char(
        string='URL Cơ sở Harness',
        config_parameter='npei_agent_harness.base_url',
        help="URL cơ sở của DeepSeek Harness, ví dụ https://harness.internal:8787. "
             "Cổng kết nối sẽ thêm /api/<method>.",
    )
    npei_harness_api_token = fields.Char(
        string='Token API Harness',
        config_parameter='npei_agent_harness.api_token',
        help="Bearer token cho harness. Trên máy chủ harness lưu tại "
             "~/.dsh/api-token. Không bao giờ lộ ra trình duyệt.",
    )
    npei_harness_ticket_secret = fields.Char(
        string='Khóa bí mật Ticket',
        config_parameter='npei_agent_harness.ticket_secret',
        help="Khóa bí mật HMAC-SHA256 dùng chung (>= 32 ký tự) mà MTIL Flask API "
             "ký vé per-user; PHẢI bằng DSH_TICKET_SECRET của harness. "
             "Flask API đọc từ tham số này. Không bao giờ lộ ra trình duyệt.",
    )

    def action_test_harness_connection(self):
        """Ping the harness with the saved settings and report the result.

        Exchanges the token for the cookie session and calls
        ``settings/describe`` — one round trip proving reachability, trust
        (Host fence), authentication, and the management RPC surface. Any
        misconfiguration or transport failure surfaces as the client's
        UserError, so the button doubles as a one-click connectivity check.
        """
        self.ensure_one()
        value = self.env['npei.agent.harness.client']._rpc('settings/describe', {}) or {}
        message = _(
            "Đã kết nối. Số namespace cài đặt: %(count)s · có thể ghi: %(writable)s"
        ) % {
            'count': len(value.get('namespaces') or []),
            'writable': value.get('writable', False),
        }
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _("MTIL Agent"),
                'message': message,
                'type': 'success',
                'sticky': False,
            },
        }

    def action_clear_data(self):
        """Delete every persistent ``npei.agent.*`` record except the XML-seeded
        provider route templates.

        System-only (``base.group_system``): a destructive maintenance reset of
        the Odoo-side mirror/ACL/config records. It does NOT touch the harness —
        provider-model unlinks run under ``npei_syncing`` so no ``settings/mutate``
        is pushed. The route templates created by
        ``data/provider_route_templates.xml`` are kept (identified by their
        ``ir.model.data`` external ids); a manager's hand-added templates, having
        no seed external id, are cleared with the rest.

        :raises AccessError: when the caller is not in ``base.group_system``.
        :returns: a success notification with the deleted-record count.
        """
        self.ensure_one()
        if not self.env.user.has_group('base.group_system'):
            raise AccessError(_(
                "Chỉ quản trị viên hệ thống mới có thể xóa dữ liệu MTIL Agent."))

        kept_template_ids = set(self.env['ir.model.data'].sudo().search([
            ('module', '=', TEMPLATE_DATA_MODULE),
            ('model', '=', TEMPLATE_MODEL),
        ]).mapped('res_id'))

        model_names = self.env['ir.model'].sudo().search(
            [('model', '=like', 'npei.agent.%')]).mapped('model')
        deleted = 0
        for name in model_names:
            model = self.env[name]
            # Transient wizards hold no durable data; abstract models have no
            # table. Neither participates in the reset.
            if model._transient or model._abstract:
                continue
            records = model.sudo().with_context(npei_syncing=True).search([])
            if name == TEMPLATE_MODEL:
                records = records.filtered(lambda r: r.id not in kept_template_ids)
            deleted += len(records)
            records.unlink()

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _("MTIL Agent"),
                'message': _("Đã xóa %s bản ghi; các mẫu tuyến được giữ lại.", deleted),
                'type': 'success',
                'sticky': False,
            },
        }
