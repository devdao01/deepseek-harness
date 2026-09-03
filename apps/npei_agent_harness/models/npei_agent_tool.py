# -*- coding: utf-8 -*-
"""Grantable-tool catalog for structured preset authoring.

Mirrors ``agentPresets/toolCatalog`` — the tools the harness's default
composition registers — so router sub-agent lines can grant tools by picking
from a list instead of memorizing names. Sync is manager-gated; records are
upserted by ``name`` and never deleted (a tool gone from the harness merely
stops matching new grants).
"""
from odoo import _, api, fields, models
from odoo.exceptions import AccessError

MANAGER_GROUP = 'npei_agent_harness.group_npei_agent_manager'


class NpeiAgentTool(models.Model):
    _name = 'npei.agent.tool'
    _description = 'DeepSeek Harness Grantable Tool'
    _order = 'name'

    name = fields.Char(
        string='Tên Công cụ', required=True, index=True,
        help="Tên công cụ theo cách toolFilter.allow cấp (ví dụ bash, web_search).",
    )
    description = fields.Text(
        string='Mô tả', readonly=True,
        help="Mô tả hướng tới mô hình được báo cáo bởi lần đồng bộ harness.",
    )
    is_default = fields.Boolean(
        string='Cấp mặc định',
        help="Được chọn sẵn trong Công cụ được cấp khi tạo dòng agent phụ router mới. "
             "Cờ cục bộ — lần đồng bộ harness không bao giờ thay đổi nó.",
    )

    _sql_constraints = [
        ('name_uniq', 'unique(name)', 'Đã tồn tại một công cụ với tên này.'),
    ]

    @api.model
    def action_sync_from_harness(self):
        """Upsert the catalog from ``agentPresets/toolCatalog``."""
        if not self.env.user.has_group(MANAGER_GROUP):
            raise AccessError(
                _("Chỉ Quản trị Agent NPEI mới có thể đồng bộ công cụ từ harness."))
        value = self.env['npei.agent.harness.client']._rpc('agentPresets/toolCatalog', {})
        entries = (value or {}).get('tools') or []
        synced = 0
        for entry in entries:
            name = entry.get('name')
            if not name:
                continue
            vals = {'description': entry.get('description') or False}
            existing = self.search([('name', '=', name)], limit=1)
            if existing:
                existing.write(vals)
            else:
                self.create(dict(vals, name=name))
            synced += 1
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _("Đồng bộ công cụ thành công"),
                'message': _("Đã đồng bộ %s công cụ từ harness.", synced),
                'type': 'success',
                'sticky': False,
            },
        }
