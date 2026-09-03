# -*- coding: utf-8 -*-
"""Agent presets: harness mirror + authoring.

The harness stays the source of truth for the composition;
:meth:`action_sync_from_harness` upserts the local mirror from
``agentPresets/list``. Creating a record WITHOUT a ``preset_id`` authors a new
preset on the harness (``agentPresets/copy`` from the default roster entry)
under a name-derived id, and deleting a user-authored mirror deletes the
harness preset (``agentPresets/deletePreset``). ``kind`` standalone/router
records instead use structured authoring (``agentPresets/author``): the
harness GENERATES the composition from its default preset plus persona,
bash/web capability flags, and (router) the department sub-agent lines —
re-generated on every relevant edit.

Harness capability notes: the roster carries
``id/name/description/trust/isDefault/active``. A ``name`` change on a
``user``-trust mirror pushes ``agentPresets/rename`` (display text only —
the harness preset id, and with it the per-preset workspace path, never
changes); toggling ``active`` pushes ``agentPresets/setActive`` (covers
``system`` presets too — the harness stores the flag in settings and
withholds deactivated presets from pickers and new selection).
``description`` travels with both calls (``agentPresets/copy`` takes it at
authoring; ``agentPresets/rename`` replaces it on edit). ``workspace_id``
is a manual annotation; ``workspace_path`` mirrors the harness's derived
``<presetWorkspaceRoot>/<preset_id>`` default.
"""
import logging
import re
import unicodedata
import uuid

from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError

_logger = logging.getLogger(__name__)

MANAGER_GROUP = 'npei_agent_harness.group_npei_agent_manager'


class NpeiAgentPreset(models.Model):
    _name = 'npei.agent.preset'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _description = 'DeepSeek Harness Agent Preset'
    _order = 'seq, name'

    preset_id = fields.Char(
        string='Mã Preset Harness',
        index=True,
        copy=False, tracking=True,
        help="Mã preset do harness sở hữu (id mục roster). Để trống khi tạo, "
             "Odoo sẽ tự sinh từ tên và đăng ký preset lên harness; chỉ được "
             "điền bởi đường dẫn sync/adopt.",
    )
    name = fields.Char(string='Tên', required=True, tracking=True)
    description = fields.Text(
        string='Mô tả', tracking=True,
        help="Mô tả trong roster harness: gửi kèm agentPresets/copy khi đăng ký "
             "và đẩy qua agentPresets/rename khi chỉnh sửa (chỉ preset trust user).",
    )
    kind = fields.Selection(
        [('copy', 'Copy of default'),
         ('standalone', 'Standalone Agent'),
         ('router', 'Router (multi-agent)')],
        string='Loại', default='copy', required=True, tracking=True,
        help="copy: bản sao đơn giản của preset mặc định harness. "
             "standalone: agent được sinh với persona và cờ khả năng bash/web riêng. "
             "router: coordinator được sinh, ủy quyền cho các agent phụ theo nhóm bên dưới. "
             "Preset standalone/router được sinh lại trên harness mỗi khi các trường này thay đổi.",
    )
    persona = fields.Text(
        string='Persona', tracking=True,
        help="Persona riêng của agent (vai trò, nhiệm vụ, kỹ năng sở hữu). Bắt buộc "
             "cho loại standalone/router; đẩy qua agentPresets/author.",
    )
    allow_bash = fields.Boolean(
        string='Cho phép Bash', tracking=True,
        help="Agent này có được chạy lệnh shell không (standalone/router).",
    )
    allow_web = fields.Boolean(
        string='Cho phép Web', default=True, tracking=True,
        help="Agent này có được tìm kiếm/tải trang web không (standalone/router).",
    )
    subagent_ids = fields.One2many(
        'npei.agent.preset.subagent', 'preset_ref',
        string='Agent phụ theo nhóm',
        help="Các nhóm của router: mỗi dòng trở thành một công cụ ủy quyền mà "
             "router gọi (sinh agent con với persona và cờ khả năng của dòng đó).",
    )
    composition = fields.Text(
        string='Cấu trúc (agent.cordis.yml)', copy=False,
        help="Ảnh chụp nhanh cấu trúc harness, tải theo yêu cầu qua "
             "agentPresets/read. Giao diện giữ chỉ đọc; action đẩy thô "
             "(agentPresets/writeRaw, cần vé quản trị '*') đã nối sẵn "
             "cho khi bật chỉnh sửa.",
    )
    is_default = fields.Boolean(
        string='Mặc định Harness', readonly=True, copy=False, tracking=True,
        help="Harness có báo mục roster này là preset mặc định cho phiên mới không.",
    )
    workspace_path = fields.Char(
        string='Đường dẫn Workspace mặc định', tracking=True,
        help="Thư mục làm việc mặc định của phiên mới theo preset này. "
             "Harness tự sinh là <presetWorkspaceRoot>/<preset id> "
             "(mặc định triển khai ~/workspace/<preset id>); đổi tên không thay đổi "
             "vì mã preset là cố định.",
    )
    workspace_id = fields.Char(
        string='ID Workspace Harness',
        copy=False, tracking=True,
        help="Chú thích thủ công về workspace harness mà preset này nhóm "
             "các phiên vào.",
    )
    trust = fields.Selection(
        [('system', 'System'), ('user', 'User')],
        string='Mức tin tưởng',
        default='user', tracking=True,
        help="Preset hệ thống đi kèm harness và chỉ đọc ở đó; "
             "chỉ preset user mới có thể được đăng ký hoặc xóa từ Odoo.",
    )
    active = fields.Boolean(
        default=True, tracking=True,
        help="Phản chiếu trạng thái active trong roster harness. Thay đổi sẽ đẩy "
             "agentPresets/setActive: preset không active bị ẩn khỏi bộ chọn và "
             "lựa chọn mới trong khi các phiên đang chạy tiếp tục.",
    )
    session_ids = fields.One2many(
        'npei.agent.session',
        'preset_id',
        string='Phiên làm việc',
        help="Các phiên đang chạy theo preset này.", tracking=True
    )
    session_count = fields.Integer(
        string='Số phiên làm việc',
        compute='_compute_session_count', tracking=True
    )
    seq = fields.Integer('Trình tự*:', default=1)
    is_locked = fields.Boolean('Đã Khóa*:', tracking=True)
    uuid = fields.Char('Mã Chuỗi Ngẫu nhiên*:', copy=False, tracking=True,
                       default=lambda self: str(uuid.uuid4()))

    @api.depends('session_ids')
    def _compute_session_count(self):
        """Count of sessions linked to this preset."""
        for record in self:
            record.session_count = len(record.session_ids)

    def action_view_sessions(self):
        """Open the sessions running under this preset."""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _("Phiên làm việc"),
            'res_model': 'npei.agent.session',
            'view_mode': 'tree,form',
            'domain': [('preset_id', '=', self.id)],
            'context': {'default_preset_id': self.id},
        }

    _sql_constraints = [
        (
            'preset_id_uniq',
            'unique(preset_id)',
            'Đã tồn tại một preset với mã harness preset này.',
        ),
    ]

    def _check_manager(self):
        """Raise unless the current user is an NPEI Agent Manager."""
        if not self.env.user.has_group(MANAGER_GROUP):
            raise AccessError(
                _("Chỉ Quản trị Agent NPEI mới có thể đồng bộ presets từ harness."))

    # ------------------------------------------------------------------
    # Authoring (create a preset on the harness)
    # ------------------------------------------------------------------
    @api.model
    def _slugify(self, name):
        """Derive a harness preset id from a display name (Vietnamese-aware).

        Strips diacritics (``đ`` -> ``d``), lowercases, and collapses every run
        of non ``[a-z0-9]`` to a single ``-`` — the harness preset id must
        match ``^[a-z0-9][a-z0-9-]*$`` (it is a directory segment).
        """
        text = (name or '').replace('đ', 'd').replace('Đ', 'D')
        text = unicodedata.normalize('NFD', text)
        text = ''.join(ch for ch in text if unicodedata.category(ch) != 'Mn')
        return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')

    @api.model
    def _harness_presets(self):
        """Return the harness roster (``agentPresets/list`` entries)."""
        value = self.env['npei.agent.harness.client'].sudo()._rpc('agentPresets/list', {})
        return (value or {}).get('presets') or []

    def _author_on_harness(self, vals):
        """Create a preset on the harness and fill ``vals`` in place.

        Copies the default roster entry under ``_slugify(name)`` with the given
        display name (``agentPresets/copy`` — void return; an authored copy is
        always ``user`` trust). Collisions are caught up front against BOTH the
        Odoo mirror and the harness roster.

        :param dict vals: the create values, mutated in place.
        :raises UserError: on a blank/unslugifiable name or a colliding id.
        """
        name = (vals.get('name') or '').strip()
        if not name:
            raise UserError(_("Phải nhập tên preset để tạo mới."))
        slug = self._slugify(name)
        if not slug:
            raise UserError(_("Không thể tạo mã preset từ tên %s.", name))
        if self.with_context(active_test=False).search_count([('preset_id', '=', slug)]):
            raise UserError(_("Đã tồn tại một preset với mã %s trong Odoo.", slug))
        presets = self._harness_presets()
        if any(entry.get('id') == slug for entry in presets):
            raise UserError(_(
                "Đã tồn tại một preset '%(slug)s' trên harness (từ tên '%(name)s'). "
                "Chọn tên khác, hoặc dùng 'Đồng bộ từ Harness' để nhận vào Odoo.",
                slug=slug, name=name))
        default_id = next((entry.get('id') for entry in presets if entry.get('isDefault')), None)
        if not default_id:
            raise UserError(_("Harness không báo cáo preset mặc định nào để sao chép."))
        copy_args = {
            'from': default_id,
            'id': slug,
            'name': name,
        }
        if (vals.get('description') or '').strip():
            copy_args['description'] = vals['description'].strip()
        self.env['npei.agent.harness.client'].sudo()._rpc('agentPresets/copy', copy_args)
        vals['preset_id'] = slug
        vals.setdefault('trust', 'user')
        # Mirror the harness's preset-derived session cwd (~/workspace/<id>).
        if not vals.get('workspace_path'):
            vals['workspace_path'] = '~/workspace/%s' % slug

    def _author_request(self):
        """Build the ``agentPresets/author`` request from this record."""
        self.ensure_one()
        if not (self.persona or '').strip():
            raise UserError(_(
                "Preset %s cần có Persona cho loại %s.", self.name, self.kind))
        request = {
            'agentPreset': self.preset_id,
            'name': self.name,
            'kind': self.kind,
            'persona': self.persona.strip(),
            'allowBash': bool(self.allow_bash),
            'allowWeb': bool(self.allow_web),
        }
        if (self.description or '').strip():
            request['description'] = self.description.strip()
        if self.kind == 'router':
            if not self.subagent_ids:
                raise UserError(_(
                    "Preset router %s cần ít nhất một agent phụ theo nhóm.",
                    self.name))
            request['subagents'] = [{
                'toolName': line.tool_name,
                'persona': (line.persona or '').strip(),
                'allowBash': bool(line.allow_bash),
                'allowWeb': bool(line.allow_web),
                **({'tools': line.tool_ids.mapped('name')} if line.tool_ids else {}),
            } for line in self.subagent_ids]
        return request

    def _push_author(self):
        """(Re-)generate this preset on the harness (``agentPresets/author``).

        Fail-loud: a composition the harness refused must not look stored.
        Suppressed under ``npei_syncing``.
        """
        if self.env.context.get('npei_syncing'):
            return
        client = self.env['npei.agent.harness.client'].sudo()
        for record in self:
            if record.kind == 'copy' or not record.preset_id or record.trust != 'user':
                continue
            client._rpc('agentPresets/author', {'request': record._author_request()})
        # Keep the Composition tab current: the harness just re-generated the
        # file, so a stale snapshot would misrepresent what actually runs.
        self.filtered(
            lambda r: r.kind in ('standalone', 'router') and r.preset_id
            and r.trust == 'user').action_load_composition()

    @api.model_create_multi
    def create(self, vals_list):
        """Author on the harness when no ``preset_id`` is given, else mirror."""
        structured = []
        for vals in vals_list:
            if vals.get('preset_id') or self.env.context.get('npei_syncing'):
                continue
            if vals.get('kind') in ('standalone', 'router'):
                # The author endpoint creates the preset itself; derive the id
                # here and skip the copy path.
                name = (vals.get('name') or '').strip()
                slug = self._slugify(name)
                if not slug:
                    raise UserError(_("Không thể tạo mã preset từ tên %s.", name))
                if self.with_context(active_test=False).search_count([('preset_id', '=', slug)]):
                    raise UserError(_("Đã tồn tại một preset với mã %s trong Odoo.", slug))
                if any(e.get('id') == slug for e in self._harness_presets()):
                    raise UserError(_(
                        "Đã tồn tại một preset '%(slug)s' trên harness.", slug=slug))
                vals['preset_id'] = slug
                vals.setdefault('trust', 'user')
                if not vals.get('workspace_path'):
                    vals['workspace_path'] = '~/workspace/%s' % slug
                structured.append(vals)
            else:
                self._author_on_harness(vals)
        records = super().create(vals_list)
        records.filtered(
            lambda r: r.kind in ('standalone', 'router')
            and not self.env.context.get('npei_syncing'))._push_author()
        return records

    def write(self, vals):
        """Write, then push renames and active toggles to the harness.

        ``name`` or ``description`` on a ``user``-trust mirror pushes
        ``agentPresets/rename`` (system presets are read-only there; their
        display edits stay local).
        ``active`` pushes ``agentPresets/setActive`` for every trust.
        Fail-loud: a push the harness refused rolls the Odoo write back.
        Suppressed under ``npei_syncing`` (mirror refresh).
        """
        result = super().write(vals)
        if self.env.context.get('npei_syncing'):
            return result
        client = self.env['npei.agent.harness.client'].sudo()
        author_fields = {'kind', 'persona', 'allow_bash', 'allow_web', 'subagent_ids', 'name', 'description'}
        structured = self.filtered(lambda r: r.kind in ('standalone', 'router'))
        if structured and author_fields.intersection(vals):
            structured._push_author()
        plain = self - structured
        if plain and ('name' in vals or 'description' in vals):
            for record in plain:
                if record.preset_id and record.trust == 'user' and (record.name or '').strip():
                    rename_args = {
                        'agentPreset': record.preset_id,
                        'name': record.name,
                    }
                    if (record.description or '').strip():
                        rename_args['description'] = record.description.strip()
                    client._rpc('agentPresets/rename', rename_args)
        if 'active' in vals:
            for record in self.with_context(active_test=False):
                if record.preset_id:
                    client._rpc('agentPresets/setActive', {
                        'agentPreset': record.preset_id,
                        'active': bool(record.active),
                    })
        return result

    def unlink(self):
        """Delete user-authored presets on the harness, then the mirror rows.

        System presets ship with the deployment (the harness refuses their
        deletion), so only ``user`` rows with a ``preset_id`` push
        ``agentPresets/deletePreset``. Fail-loud: an unreachable harness rolls
        the Odoo unlink back rather than orphaning the harness preset.
        """
        if not self.env.context.get('npei_syncing'):
            client = self.env['npei.agent.harness.client'].sudo()
            for record in self:
                if record.preset_id and record.trust == 'user':
                    client._rpc('agentPresets/deletePreset', {'id': record.preset_id})
        return super().unlink()

    @api.model
    def action_sync_from_harness(self):
        """Upsert local presets from the harness ``agentPresets/list``.

        Manager-gated. Returns a client notification action summarising the
        sync so it can back an ``ir.actions.server`` menu item.
        """
        self._check_manager()
        entries = self._harness_presets()
        model = self.with_context(npei_syncing=True)
        synced = 0
        for entry in entries:
            preset_id = entry.get('id')
            if not preset_id:
                continue
            vals = {
                'name': entry.get('name') or preset_id,
                'description': entry.get('description') or False,
                'trust': entry.get('trust') or 'user',
                'is_default': bool(entry.get('isDefault')),
                'active': entry.get('active', True),
            }
            # active_test=False so a locally archived mirror is found and
            # updated rather than duplicated into a preset_id_uniq violation.
            existing = model.with_context(active_test=False).search(
                [('preset_id', '=', preset_id)], limit=1)
            if existing:
                existing.write(vals)
            else:
                model.create(dict(vals, preset_id=preset_id))
            synced += 1
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _("Đồng bộ presets thành công"),
                'message': _("Đã đồng bộ %s preset từ harness.", synced),
                'type': 'success',
                'sticky': False,
            },
        }

    def action_load_composition(self):
        """Fill ``composition`` from the harness (``agentPresets/read``)."""
        client = self.env['npei.agent.harness.client'].sudo()
        for record in self:
            if not record.preset_id:
                continue
            value = client._rpc('agentPresets/read', {'agentPreset': record.preset_id})
            record.with_context(npei_syncing=True).write({
                'composition': (value or {}).get('content') or False,
            })

    def action_push_raw_composition(self):
        """Replace the harness composition with the ``composition`` field.

        ``agentPresets/writeRaw`` accepts only the management wildcard once a
        ticket secret is configured; the form keeps the field read-only until
        raw editing is deliberately enabled.
        """
        client = self.env['npei.agent.harness.client'].sudo()
        for record in self:
            if not record.preset_id or not (record.composition or '').strip():
                raise UserError(_(
                    "Hãy tải (và chỉnh sửa) cấu trúc trước khi gửi."))
            client._rpc('agentPresets/writeRaw', {'request': {
                'agentPreset': record.preset_id,
                'name': record.name,
                **({'description': record.description.strip()}
                   if (record.description or '').strip() else {}),
                'content': record.composition,
            }})

    def act_lock(self):
        self.write({'is_locked': True})

    def act_unlock(self):
        self.write({'is_locked': False})


class NpeiAgentPresetSubagent(models.Model):
    """One router department: a delegation tool spawning a child agent."""

    _name = 'npei.agent.preset.subagent'
    _description = 'DeepSeek Harness Router Sub-agent'
    _order = 'seq, id'

    preset_ref = fields.Many2one(
        'npei.agent.preset', string='Preset Router',
        required=True, ondelete='cascade', index=True,
    )
    seq = fields.Integer(string='Thứ tự', default=10)
    tool_name = fields.Char(
        string='Tên Công cụ', required=True,
        help="Công cụ ủy quyền mà router gọi (slug chữ thường, ví dụ "
             "'marketing'); cũng là danh tính của nhóm.",
    )
    persona = fields.Text(
        string='Persona', required=True,
        help="Persona của agent con: vai trò, nhiệm vụ và kỹ năng sở hữu.",
    )
    allow_bash = fields.Boolean(string='Cho phép Bash')
    allow_web = fields.Boolean(string='Cho phép Web')
    tool_ids = fields.Many2many(
        'npei.agent.tool', string='Công cụ được cấp',
        default=lambda self: self.env['npei.agent.tool'].search(
            [('is_default', '=', True)]).ids,
        help="Cấp công cụ rõ ràng cho agent phụ này (được điền sẵn với các "
             "công cụ Default Grant trong danh mục). Khi đặt, THAY THẾ cờ "
             "bash/web; để trống sẽ dùng cờ cộng bộ công cụ file/skill/job tiêu chuẩn.",
    )

    @api.constrains('tool_name')
    def _check_tool_name(self):
        for line in self:
            if not re.match(r'^[a-z0-9][a-z0-9_-]*$', line.tool_name or ''):
                raise UserError(_(
                    "Tên công cụ %s phải là slug chữ thường ([a-z0-9_-]).",
                    line.tool_name))

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        records.mapped('preset_ref')._push_author()
        return records

    def write(self, vals):
        result = super().write(vals)
        self.mapped('preset_ref')._push_author()
        return result

    def unlink(self):
        presets = self.mapped('preset_ref')
        result = super().unlink()
        presets._push_author()
        return result
