# -*- coding: utf-8 -*-
"""Harness host status panel.

Manager-only, read-only snapshot of the DeepSeek Harness host, assembled from
the verified management surface: ``GET /api/boot.payload`` (reachability +
authentication + the count of boot injection rows), ``settings/describe``
(the ``agent-default-model`` namespace value), ``session/list`` (session and
running counts), and ``session/canOpenWorkspacePath``.

There is nothing to configure here — this is an operations dashboard. Opening
the panel fetches once (``default_get``); the Refresh button re-fetches.
"""
from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError

MANAGER_GROUP = 'npei_agent_harness.group_npei_agent_manager'

# Settings namespace whose value names the deployment default model.
DEFAULT_MODEL_NS = 'agent-default-model'


class NpeiHostStatus(models.TransientModel):
    _name = 'npei.agent.host.status'
    _description = 'DeepSeek Harness Host Status'

    reachable = fields.Boolean(
        string='Có thể truy cập',
        readonly=True,
        help="Harness có trả lời thăm dò boot-payload xác thực với HTTP 200 không.",
    )
    http_status = fields.Integer(
        string='Trạng thái HTTP',
        readonly=True,
        help="Trạng thái GET /api/boot.payload (200 = có thể truy cập và xác thực; "
             "401 = token API sai/hết hạn; 403 = harness không tin tưởng domain này).",
    )
    injection_rows = fields.Integer(
        string='Số dòng Boot Injection',
        readonly=True,
        help="Số dòng trong bảng boot injection — bề mặt plugin client "
             "mà harness hiện đang phục vụ.",
    )
    provider = fields.Char(
        string='Nhà cung cấp mặc định',
        readonly=True,
        help="Nhà cung cấp áp dụng cho phiên mới (agent-default-model).",
    )
    model = fields.Char(
        string='Mô hình mặc định',
        readonly=True,
        help="Mô hình áp dụng cho phiên mới (agent-default-model).",
    )
    reasoning_effort = fields.Char(
        string='Mức suy luận mặc định',
        readonly=True,
        help="Mức suy luận áp dụng cho phiên mới (agent-default-model).",
    )
    session_count = fields.Integer(
        string='Phiên làm việc',
        readonly=True,
        help="Số phiên mà harness hiện liệt kê.",
    )
    running_sessions = fields.Integer(
        string='Phiên đang chạy',
        readonly=True,
        help="Số phiên có agent đang chạy.",
    )
    can_open_path = fields.Boolean(
        string='Có thể mở đường dẫn bản địa',
        readonly=True,
        help="Triển khai này có thể chuyển đường dẫn tới desktop bản địa hiển thị "
             "cho người dùng không (false trên backend headless).",
    )

    def _check_manager(self):
        """Raise unless the current user is an NPEI Agent Manager."""
        if not self.env.user.has_group(MANAGER_GROUP):
            raise AccessError(
                _("Chỉ Quản trị Agent NPEI mới có thể xem trạng thái máy chủ harness."))

    @api.model
    def _snapshot(self):
        """Fetch one status snapshot as wizard field values."""
        client = self.env['npei.agent.harness.client'].sudo()
        vals = {
            'reachable': False,
            'http_status': 0,
            'injection_rows': 0,
            'provider': False,
            'model': False,
            'reasoning_effort': False,
            'session_count': 0,
            'running_sessions': 0,
            'can_open_path': False,
        }
        status, rows = client._host_status()
        vals['http_status'] = status
        vals['reachable'] = status == 200
        vals['injection_rows'] = rows or 0
        if not vals['reachable']:
            return vals
        try:
            described = client._rpc('settings/describe', {}) or {}
            entry = next((row for row in described.get('namespaces') or []
                          if row.get('ns') == DEFAULT_MODEL_NS), None)
            value = (entry or {}).get('value') or {}
            vals['provider'] = value.get('provider') or False
            vals['model'] = value.get('model') or False
            vals['reasoning_effort'] = value.get('reasoningEffort') or False
            items = (client._rpc('session/list', {'_request': {}}) or {}).get('items') or []
            vals['session_count'] = len(items)
            vals['running_sessions'] = sum(1 for item in items if item.get('running'))
            vals['can_open_path'] = bool(client._rpc('session/canOpenWorkspacePath', {}))
        except UserError:
            # Reachability stands; the enrichment calls surface their own
            # failure on the next explicit action instead of blanking the panel.
            pass
        return vals

    @api.model
    def default_get(self, fields_list):
        """Open the panel pre-filled with a fresh snapshot."""
        self._check_manager()
        result = super().default_get(fields_list)
        result.update(self._snapshot())
        return result

    def action_refresh(self):
        """Re-fetch the snapshot into this transient record."""
        self.ensure_one()
        self._check_manager()
        self.write(self._snapshot())
        return {
            'type': 'ir.actions.act_window',
            'res_model': self._name,
            'res_id': self.id,
            'view_mode': 'form',
            'target': 'new',
        }
