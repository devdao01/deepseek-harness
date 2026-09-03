# -*- coding: utf-8 -*-
"""LLM provider mirror.

Odoo-side catalog of harness LLM providers, synced from ``llm/listConfigurableProviders``. The
harness stays the source of truth for provider routing; this mirror is a
read-only management surface plus Odoo archiving.

The harness ``active`` flag (whether the route is live) is stored as
:attr:`route_active` so it does not clash with Odoo's own ``active`` archive
field.
"""
import uuid

from odoo import _, api, fields, models
from odoo.exceptions import AccessError

MANAGER_GROUP = 'npei_agent_harness.group_npei_agent_manager'


class NpeiAgentProvider(models.Model):
    _name = 'npei.agent.provider'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _description = 'DeepSeek Harness LLM Provider'
    _order = 'seq, provider'

    provider = fields.Char(
        string='Nhà cung cấp',
        required=True,
        index=True,
        copy=False, tracking=True,
        help="Mã nhà cung cấp do harness sở hữu (``ProviderView.provider``).",
    )
    display_name = fields.Char(
        string='Tên hiển thị', tracking=True,
        help="Tên nhà cung cấp dễ đọc từ ``llm/listConfigurableProviders``.",
    )
    settings_ns = fields.Char(
        string='Không gian tên cài đặt', tracking=True,
        help="Không gian tên cài đặt mà nhà cung cấp này đọc cấu hình từ đó "
             "(khóa thô; đối tác khớp settings_id).",
    )
    settings_id = fields.Many2one(
        'npei.agent.setting',
        string='Bản ghi không gian tên cài đặt',
        index=True,
        ondelete='set null', tracking=True,
        help="Bản ghi phản chiếu không gian tên khớp với settings_ns; để trống "
             "cho đến khi cài đặt được đồng bộ. Nhiều nhà cung cấp có thể dùng chung một namespace.",
    )
    settings_path = fields.Char(
        string='Đường dẫn cài đặt', tracking=True,
        help="Các đoạn ``settingsPath`` của harness nối với ``/``.",
    )
    route_active = fields.Boolean(
        string='Tuyến đang hoạt động', tracking=True,
        help="Harness có báo tuyến của nhà cung cấp này đang hoạt động không.",
    )
    declared = fields.Boolean(
        string='Đã khai báo', tracking=True,
        help="Nhà cung cấp có được khai báo rõ ràng trong cài đặt không.",
    )
    active = fields.Boolean(default=True, tracking=True)
    seq = fields.Integer('Trình tự*:', default=1)
    is_locked = fields.Boolean('Đã Khóa*:', tracking=True)
    uuid = fields.Char('Mã Chuỗi Ngẫu nhiên*:', copy=False, tracking=True,
                       default=lambda self: str(uuid.uuid4()))
    model_ids = fields.One2many(
        'npei.agent.provider.model',
        'provider_id',
        string='Mô hình đã cấu hình',
        help="Mảng mô hình có thể chỉnh sửa được đẩy vào không gian tên cài đặt "
             "của nhà cung cấp này (settings[ns].user[...path].models).",
    )
    catalog_model_ids = fields.One2many(
        'npei.agent.model',
        'provider_id',
        string='Mô hình danh mục',
        help="Mô hình danh mục đã phân giải chỉ đọc (llm.models) có group id "
             "khớp với nhà cung cấp này.",
    )
    catalog_model_count = fields.Integer(
        string='Số mô hình danh mục',
        compute='_compute_catalog_model_count',
    )

    @api.depends('catalog_model_ids')
    def _compute_catalog_model_count(self):
        """Count of resolved catalog models linked to this provider."""
        for record in self:
            record.catalog_model_count = len(record.catalog_model_ids)

    def action_view_catalog_models(self):
        """Open the resolved catalog models linked to this provider."""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _("Mô hình danh mục"),
            'res_model': 'npei.agent.model',
            'view_mode': 'tree,form',
            'domain': [('provider_id', '=', self.id)],
            'context': {'default_provider_id': self.id},
        }

    _sql_constraints = [
        (
            'provider_uniq',
            'unique(provider)',
            'Đã tồn tại một nhà cung cấp với mã này.',
        ),
    ]

    def _check_manager(self):
        """Raise unless the current user is an NPEI Agent Manager."""
        if not self.env.user.has_group(MANAGER_GROUP):
            raise AccessError(
                _("Chỉ Quản trị Agent NPEI mới có thể đồng bộ nhà cung cấp từ harness."))

    def _notify(self, message):
        """Build a success ``display_notification`` client action."""
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

    @api.model
    def action_sync_from_harness(self):
        """Upsert local providers from the harness ``llm/listConfigurableProviders``.

        Manager-gated. Returns a client notification action so it can back an
        ``ir.actions.server`` menu item.
        """
        self._check_manager()
        client = self.env['npei.agent.harness.client'].sudo()
        # llm/listConfigurableProviders carries every configurable route;
        # llm/listProviders lists the routes an adapter currently serves.
        entries = client._rpc('llm/listConfigurableProviders', {}) or []
        active_ids = {row.get('id') for row in (client._rpc('llm/listProviders', {}) or [])}
        synced = 0
        for entry in entries:
            provider = entry.get('provider')
            if not provider:
                continue
            path = entry.get('settingsPath') or []
            settings_ns = entry.get('settingsNs') or False
            setting = self.env['npei.agent.setting'].search(
                [('ns', '=', settings_ns)], limit=1) if settings_ns else False
            vals = {
                'display_name': entry.get('displayName') or provider,
                'settings_ns': settings_ns,
                'settings_id': setting.id if setting else False,
                'settings_path': '/'.join(path) if path else False,
                'route_active': provider in active_ids,
                # An absent `declared` means the route IS declared in settings.
                'declared': entry.get('declared', True),
            }
            existing = self.search([('provider', '=', provider)], limit=1)
            if existing:
                existing.write(vals)
                record = existing
            else:
                record = self.create(dict(vals, provider=provider))
            # Backfill catalog models synced before this provider existed.
            self.env['npei.agent.model'].search([
                ('provider', '=', provider),
                ('provider_id', '!=', record.id),
            ]).write({'provider_id': record.id})
            synced += 1
        return self._notify(_("Đã đồng bộ %s nhà cung cấp từ harness.", synced))

    def action_sync_models(self):
        """Mirror every provider's configured models from the harness.

        Manager-gated (delegates to
        ``npei.agent.provider.model.action_sync_from_harness``). Backs the
        provider form's *Sync Models from Harness* button.
        """
        return self.env['npei.agent.provider.model'].action_sync_from_harness()

    def act_lock(self):
        self.write({'is_locked': True})

    def act_unlock(self):
        self.write({'is_locked': False})
