# -*- coding: utf-8 -*-
"""LLM model catalog mirror.

Odoo-side static catalog of harness LLM models, synced from ``session/modelCatalog``.
Each record is one model within a provider group (``group.id``). The harness
stays the source of truth; this mirror is a read-only management surface plus
Odoo archiving. Group resolution ``failures`` reported by the harness are logged
as a warning rather than raised, so a single broken group does not abort the
whole sync.
"""
import logging
import uuid

from odoo import _, api, fields, models
from odoo.exceptions import AccessError

_logger = logging.getLogger(__name__)

MANAGER_GROUP = 'npei_agent_harness.group_npei_agent_manager'


class NpeiAgentModel(models.Model):
    _name = 'npei.agent.model'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _description = 'DeepSeek Harness LLM Model'
    _order = 'seq, provider, model_id'

    model_id = fields.Char(
        string='Mã Mô hình',
        required=True,
        index=True,
        copy=False, tracking=True,
        help="Mã model do harness sở hữu (``ModelView.id``).",
    )
    name = fields.Char(string='Tên', tracking=True)
    provider = fields.Char(
        string='Mã Nhà cung cấp',
        required=True,
        index=True, tracking=True,
        help="Mã nhóm nhà cung cấp mà model này thuộc về (``group.id``); "
             "khóa thô từ llm.models và đối tác unique-constraint.",
    )
    provider_id = fields.Many2one(
        'npei.agent.provider',
        string='Tuyến Nhà cung cấp',
        index=True,
        ondelete='set null', tracking=True,
        help="Tuyến nhà cung cấp mà nhóm của model này ánh xạ tới (khớp theo "
             "group id == provider id); để trống khi chưa có nhà cung cấp phản chiếu nào khớp. "
             "Được phân giải bởi bất kỳ lần đồng bộ nào.",
    )
    description = fields.Text(string='Mô tả', tracking=True)
    active = fields.Boolean(default=True, tracking=True)
    seq = fields.Integer('Trình tự*:', default=1)
    is_locked = fields.Boolean('Đã Khóa*:', tracking=True)
    uuid = fields.Char('Mã Chuỗi Ngẫu nhiên*:', copy=False, tracking=True,
                       default=lambda self: str(uuid.uuid4()))

    _sql_constraints = [
        (
            'provider_model_uniq',
            'unique(provider, model_id)',
            'Đã tồn tại một mô hình với mã này cho nhà cung cấp này.',
        ),
    ]

    def _check_manager(self):
        """Raise unless the current user is an NPEI Agent Manager."""
        if not self.env.user.has_group(MANAGER_GROUP):
            raise AccessError(
                _("Chỉ Quản trị Agent NPEI mới có thể đồng bộ mô hình từ harness."))

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
        """Upsert local models from the harness ``session/modelCatalog`` groups.

        Manager-gated. Iterates every group's models, upserting by
        ``(provider, model_id)``. Any group ``failures`` are logged as a
        warning. Returns a client notification action so it can back an
        ``ir.actions.server`` menu item.
        """
        self._check_manager()
        value = self.env['npei.agent.harness.client'].sudo()._rpc('session/modelCatalog', {})
        groups = value.get('groups') or []
        failures = value.get('failures') or []
        synced = 0
        for group in groups:
            provider = group.get('id')
            if not provider:
                continue
            provider_record = self.env['npei.agent.provider'].search(
                [('provider', '=', provider)], limit=1)
            for model in group.get('models') or []:
                model_id = model.get('id')
                if not model_id:
                    continue
                vals = {
                    'name': model.get('name') or model_id,
                    'description': model.get('description') or False,
                    'provider_id': provider_record.id or False,
                }
                existing = self.search([
                    ('provider', '=', provider),
                    ('model_id', '=', model_id),
                ], limit=1)
                if existing:
                    existing.write(vals)
                else:
                    self.create(dict(vals, provider=provider, model_id=model_id))
                synced += 1
        if failures:
            _logger.warning(
                "session/modelCatalog reported %s group failure(s): %s",
                len(failures),
                '; '.join(
                    '%s (%s)' % (failure.get('id'), failure.get('message'))
                    for failure in failures),
            )
        return self._notify(_("Đã đồng bộ %s mô hình từ harness.", synced))

    def act_lock(self):
        self.write({'is_locked': True})

    def act_unlock(self):
        self.write({'is_locked': False})
