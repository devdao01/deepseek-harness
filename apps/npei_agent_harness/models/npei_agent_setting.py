# -*- coding: utf-8 -*-
"""Harness settings namespaces: mirror + whole-section replace.

Odoo-side management surface for the harness settings document, one record per
namespace. :meth:`action_sync_from_harness` mirrors each namespace from
``settings/describe`` (redacted resolved value + raw user section + revision);
:meth:`action_save` pushes an edited user section back with ``settings/replace``
using the mirrored ``revision`` as ``expectedRevision`` so a concurrent change
is refused rather than silently overwritten.
"""
import json
import logging
import uuid

from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError

_logger = logging.getLogger(__name__)

MANAGER_GROUP = 'npei_agent_harness.group_npei_agent_manager'


class NpeiAgentSetting(models.Model):
    _name = 'npei.agent.setting'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _description = 'DeepSeek Harness Settings Namespace'
    _order = 'seq, ns'

    ns = fields.Char(
        string='Không gian tên',
        required=True,
        index=True,
        copy=False, tracking=True,
        help="Khóa không gian tên cài đặt do harness sở hữu.",
    )
    applies = fields.Selection(
        [('live', 'Live'), ('restart', 'Restart')],
        string='Áp dụng',
        readonly=True, tracking=True,
        help="Thay đổi có hiệu lực ngay (live) hay cần khởi động lại harness (restart).",
    )
    has_document = fields.Boolean(
        string='Có tài liệu',
        readonly=True, tracking=True,
        help="Harness có tài liệu cài đặt được lưu lại không.",
    )
    revision = fields.Integer(
        string='Phiên bản',
        readonly=True, tracking=True,
        help="Phiên bản namespace được dùng làm ``expectedRevision`` khi lưu "
             "để từ chối thay đổi đồng thời.",
    )
    value_json = fields.Text(
        string='Giá trị đã phân giải',
        readonly=True,
        help="Giá trị đã phân giải được làm mờ (base + user), chỉ đọc.",
    )
    user_json = fields.Text(
        string='Phần người dùng',
        help="Phần user thô. Chỉnh sửa và Lưu để thay thế trên harness.",
    )
    active = fields.Boolean(default=True, tracking=True)
    seq = fields.Integer('Trình tự*:', default=1)
    is_locked = fields.Boolean('Đã Khóa*:', tracking=True)
    uuid = fields.Char('Mã Chuỗi Ngẫu nhiên*:', copy=False, tracking=True,
                       default=lambda self: str(uuid.uuid4()))
    provider_ids = fields.One2many(
        'npei.agent.provider',
        'settings_id',
        string='Nhà cung cấp',
        help="Các tuyến nhà cung cấp đọc cấu hình từ namespace này.",
    )

    _sql_constraints = [
        (
            'ns_uniq',
            'unique(ns)',
            'Đã tồn tại một không gian tên cài đặt với khóa này.',
        ),
    ]

    def _check_manager(self):
        """Raise unless the current user is an NPEI Agent Manager."""
        if not self.env.user.has_group(MANAGER_GROUP):
            raise AccessError(
                _("Chỉ Quản trị Agent NPEI mới có thể quản lý cài đặt harness."))

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
    def _dumps(self, value):
        """Pretty-print a JSON value for a text field (stable key order)."""
        return json.dumps(value or {}, indent=2, ensure_ascii=False, sort_keys=True)

    @api.model
    def _vals_from_view(self, view):
        """Build record values from a ``SettingsNamespaceView``.

        Covers the fields both ``settings/describe`` entries and
        ``settings/replace`` return: applies, revision, resolved value, and the
        raw user section. ``has_document`` is namespace-independent and set by
        the sync path only.

        :param dict view: a namespace view (``settings/describe`` entry or the
            ``settings/replace`` result).
        :rtype: dict
        """
        applies = view.get('applies')
        return {
            'applies': applies if applies in ('live', 'restart') else False,
            'revision': view.get('revision') or 0,
            'value_json': self._dumps(view.get('value')),
            'user_json': self._dumps(view.get('user')),
        }

    @api.model
    def action_sync_from_harness(self):
        """Upsert local namespaces from the harness ``settings/describe``.

        Manager-gated. Returns a client notification action so it can back an
        ``ir.actions.server`` menu item.
        """
        self._check_manager()
        value = self.env['npei.agent.harness.client'].sudo()._rpc('settings/describe', {})
        namespaces = value.get('namespaces') or []
        has_document = bool(value.get('hasDocument'))
        synced = 0
        for entry in namespaces:
            ns = entry.get('ns')
            if not ns:
                continue
            vals = dict(self._vals_from_view(entry), has_document=has_document)
            existing = self.search([('ns', '=', ns)], limit=1)
            if existing:
                existing.write(vals)
                record = existing
            else:
                record = self.create(dict(vals, ns=ns))
            # Backfill providers that named this namespace before it was mirrored.
            self.env['npei.agent.provider'].search([
                ('settings_ns', '=', ns),
                ('settings_id', '!=', record.id),
            ]).write({'settings_id': record.id})
            synced += 1
        return self._notify(
            _("Đã đồng bộ %s không gian tên cài đặt từ harness.", synced))

    def action_save(self):
        """Replace this namespace's user section on the harness.

        Manager-gated. Parses :attr:`user_json` (must be a JSON object) and calls
        ``settings/replace`` with the mirrored ``revision`` as
        ``expectedRevision``; a stale revision is refused by the harness and
        surfaced with a re-sync hint. On success the record is refreshed from the
        returned view (new revision/value).

        :raises UserError: when ``user_json`` is not a JSON object, or the
            harness refuses the replace.
        """
        self.ensure_one()
        self._check_manager()
        try:
            section = json.loads(self.user_json or '{}')
        except (ValueError, TypeError) as exc:
            raise UserError(_(
                "Phần người dùng cho %(ns)s không phải JSON hợp lệ: %(error)s",
                ns=self.ns, error=exc))
        if not isinstance(section, dict):
            raise UserError(_(
                "Phần người dùng cho %s phải là một JSON object.", self.ns))
        try:
            view = self.env['npei.agent.harness.client'].sudo()._rpc(
                'settings/replace', {
                    'ns': self.ns,
                    'section': section,
                    'expectedRevision': self.revision,
                })
        except UserError as exc:
            raise UserError(_(
                "Lưu không gian tên cài đặt %(ns)s thất bại: %(error)s\n"
                "Nếu client khác đã thay đổi, dùng 'Đồng bộ từ Harness' để tải lại "
                "phiên bản hiện tại, rồi áp lại chỉnh sửa của bạn.",
                ns=self.ns, error=exc))
        self.write(self._vals_from_view(view))
        return self._notify(
            _("Đã lưu không gian tên cài đặt %(ns)s (phiên bản %(rev)s).",
              ns=self.ns, rev=self.revision))

    def act_lock(self):
        self.write({'is_locked': True})

    def act_unlock(self):
        self.write({'is_locked': False})
