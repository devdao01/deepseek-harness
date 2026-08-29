# -*- coding: utf-8 -*-
"""Agent presets: mirror + authoring.

Odoo-side management surface for harness agent presets. The harness stays the
source of truth for the composition; :meth:`action_sync_from_harness` upserts
the local mirror from ``presetWorkspace/list``, and creating a record WITHOUT a
``preset_id`` authors a new preset on the harness (``presetWorkspace/copy`` from
the default) under a name-derived id.

The mtil ``presetWorkspace`` Remote (0.1.2, fork) wraps the stock agent-presets
roster and provisions a per-preset workspace on ``copy`` (answering
``{agentPreset, workspace}``) so authored presets keep a ``workspace_id`` for
skill authoring. Stock 0.1.2 agent-presets exposes NO metadata-push and NO
``disabled`` state, so the former ``agentPreset.update`` round-trip is gone:
editing a preset's name/description no longer pushes to the harness (the name is
fixed at ``copy`` time and the composition owns its published metadata), and the
``active`` flag is now a LOCAL-mirror archive concern only — archiving a preset
in Odoo does not disable it on the harness.
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
        string='Harness Preset ID',
        index=True,
        copy=False, tracking=True,
        help="Preset id owned by the harness (``AgentPresetEntry.id``). Left "
             "blank on create, Odoo derives it from the name and authors the "
             "preset on the harness; set only by the sync/adopt path.",
    )
    name = fields.Char(string='Name', required=True, tracking=True)
    description = fields.Text(string='Description', tracking=True)
    workspace_path = fields.Char(
        string='Default Workspace Path',
        help="Canonical path of the preset's provisioned default workspace "
             "(user presets only).", tracking=True
    )
    workspace_id = fields.Char(
        string='Harness Workspace ID',
        copy=False, tracking=True,
        help="Workspace id the harness provisioned for this preset's default "
             "workspace (from presetWorkspace/copy). Used to push the preset name "
             "as the workspace title so the SPA sidebar shows the Odoo name. "
             "presetWorkspace links the workspace by the convention "
             "``<presetWorkspacesRoot>/<presetId>`` and stores no path, so it "
             "answers an empty id when the directory is not registered — a blank "
             "value here means 'not provisioned yet' (every read of this field is "
             "a truthiness check). The deployment MUST set presetWorkspacesRoot "
             "(default ``<home>/workspace``) to the same root skill authoring uses.",
    )
    trust = fields.Selection(
        [('system', 'System'), ('user', 'User')],
        string='Trust',
        default='user', tracking=True
    )
    active = fields.Boolean(
        default=True,
        help="Local-mirror archive flag. Harness 0.1.2 agent-presets has no "
             "``disabled`` state, so archiving a preset here only hides the Odoo "
             "mirror row; it does NOT disable the preset on the harness.",
        tracking=True
    )
    session_ids = fields.One2many(
        'npei.agent.session',
        'preset_id',
        string='Sessions',
        help="Sessions running under this preset.", tracking=True
    )
    session_count = fields.Integer(
        string='Session Count',
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
            'name': _("Sessions"),
            'res_model': 'npei.agent.session',
            'view_mode': 'tree,form',
            'domain': [('preset_id', '=', self.id)],
            'context': {'default_preset_id': self.id},
        }

    _sql_constraints = [
        (
            'preset_id_uniq',
            'unique(preset_id)',
            'A preset with this harness preset id already exists.',
        ),
    ]

    def _check_manager(self):
        """Raise unless the current user is an NPEI Agent Manager."""
        if not self.env.user.has_group(MANAGER_GROUP):
            raise AccessError(
                _("Only NPEI Agent Managers can sync presets from the harness."))

    # ------------------------------------------------------------------
    # Authoring (create a preset on the harness)
    # ------------------------------------------------------------------
    @api.model
    def _slugify(self, name):
        """Derive a harness preset id from a display name (Vietnamese-aware).

        Strips diacritics (``đ`` -> ``d``), lowercases, and collapses every run
        of non ``[a-z0-9]`` to a single ``-``: ``'Hồ Sơ X'`` -> ``'ho-so-x'``,
        ``'Tiếp Tân'`` -> ``'tiep-tan'``. Hyphen — not underscore — because the
        harness preset id must match ``^[a-z0-9][a-z0-9-]*$`` (the id is a
        directory segment); an underscore id would be rejected.
        """
        text = (name or '').replace('đ', 'd').replace('Đ', 'D')
        text = unicodedata.normalize('NFD', text)
        text = ''.join(ch for ch in text if unicodedata.category(ch) != 'Mn')
        return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')

    @api.model
    def _harness_presets(self):
        """Return the harness roster (``presetWorkspace/list`` entries)."""
        value = self.env['npei.agent.harness.client'].sudo()._rpc('agentPreset.list', {})
        return value.get('presets') or []

    def _author_on_harness(self, vals):
        """Create a preset on the harness and fill ``vals`` in place.

        Copies the default preset under ``_slugify(name)``; the harness copy
        keeps the SOURCE's composition, and an authored copy is always ``user``
        trust. The provisioned workspace id/path is stored back. The name is set
        at ``copy`` time; description is not pushed (0.1.2 exposes no preset
        metadata write — see the module docstring).

        Collisions are caught up front against BOTH the Odoo mirror and the
        harness roster, so a slug already taken on the harness (e.g. a preset
        left by an earlier failed create) reports a clear message instead of the
        harness's raw ``agent-preset-invalid``.

        :param dict vals: the create values, mutated in place.
        :raises UserError: on a blank/unslugifiable name or a colliding id.
        """
        name = (vals.get('name') or '').strip()
        if not name:
            raise UserError(_("A preset name is required to create one."))
        slug = self._slugify(name)
        if not slug:
            raise UserError(_("Cannot derive a preset id from the name %s.", name))
        if self.with_context(active_test=False).search_count([('preset_id', '=', slug)]):
            raise UserError(_("A preset with id %s already exists in Odoo.", slug))
        presets = self._harness_presets()
        if any(entry.get('id') == slug for entry in presets):
            raise UserError(_(
                "A preset '%(slug)s' already exists on the harness (from the "
                "name '%(name)s'). Pick a different name, or use 'Sync from "
                "Harness' to adopt it into Odoo.",
                slug=slug, name=name))
        default_id = next((entry.get('id') for entry in presets if entry.get('isDefault')), None)
        if not default_id:
            raise UserError(_("The harness reports no default preset to copy from."))
        value = self.env['npei.agent.harness.client'].sudo()._rpc('agentPreset.copy', {
            'from': default_id,
            'id': slug,
            'name': name,
        })
        # presetWorkspace/copy answers {agentPreset, workspace} where ``workspace``
        # is the provisioned workspace id STRING (0.1.2 exposes no path). The path
        # is left blank; skill authoring keys off ``workspace_id`` alone.
        vals['preset_id'] = value.get('agentPreset') or slug
        workspace_id = value.get('workspace')
        if workspace_id:
            vals['workspace_id'] = workspace_id
        vals.setdefault('trust', 'user')

    def _resolve_workspace_id_by_path(self, path):
        """Return the harness workspace id registered at ``path``, or ``None``.

        Presets authored before ``workspace_id`` was stored keep it blank; the
        harness workspace still exists at the preset's ``workspace_path``, so we
        recover its id from the roster by matching the path.
        """
        value = self.env['npei.agent.harness.client'].sudo()._rpc('workspace.list', {})
        for item in (value.get('items') or []):
            if item.get('path') == path:
                return item.get('workspaceId')
        return None

    def _push_workspace_title(self):
        """Best-effort: set each USER preset's harness workspace title from ``name``.

        The provisioned workspace's title defaults to its directory basename
        (e.g. ``ho-so-1``); this renames it to the preset's display name via
        ``workspace.rename`` (full-token) so the SPA sidebar groups sessions under
        the Odoo name (``Hồ Sơ 1``). A preset authored before ``workspace_id`` was
        stored has it blank, so the id is recovered from ``workspace.list`` by
        ``workspace_path`` and backfilled. Cosmetic, so a failure — an unreachable
        harness, or a duplicate title (``workspace-name-conflict``) — is logged and
        swallowed rather than rolling the Odoo write back. Skips system/adopted
        presets with no workspace, or a blank name.
        """
        client = self.env['npei.agent.harness.client'].sudo()
        for record in self:
            if record.trust != 'user' or not (record.name or '').strip():
                continue
            try:
                workspace_id = record.workspace_id
                if not workspace_id and record.workspace_path:
                    workspace_id = record._resolve_workspace_id_by_path(record.workspace_path)
                    if workspace_id:
                        # Backfill so later pushes skip the roster lookup. Writing
                        # only this field re-enters write() but matches neither push
                        # trigger, so it does not recurse.
                        record.workspace_id = workspace_id
                if not workspace_id:
                    continue
                client._rpc('workspace.rename', {
                    'workspaceId': workspace_id,
                    'title': record.name,
                })
            except UserError as exc:
                _logger.warning(
                    "Failed to push workspace title for preset %s: %s", record.preset_id, exc)

    @api.model_create_multi
    def create(self, vals_list):
        """Author on the harness when no ``preset_id`` is given, else mirror.

        A record saved without ``preset_id`` (the Odoo "new preset" flow) is
        authored via ``presetWorkspace/copy``; a record given one (the sync/adopt
        path, e.g. :meth:`action_sync_from_harness`) is mirrored as-is. 0.1.2
        exposes no preset metadata write, so nothing but the provisioned
        workspace title is pushed back.
        """
        authored = []
        for vals in vals_list:
            was_authored = not vals.get('preset_id')
            if was_authored:
                self._author_on_harness(vals)
            authored.append(was_authored)
        records = super().create(vals_list)
        for record, was_authored in zip(records, authored):
            if was_authored:
                # Cosmetic; best-effort internally, so it never rolls the record
                # back (the preset is already provisioned on the harness).
                record._push_workspace_title()
        return records

    def write(self, vals):
        """Write, then push the workspace title when ``name`` changed.

        0.1.2 exposes no preset metadata write, so editing ``description`` or the
        local ``active`` archive flag pushes nothing to the harness. A ``name``
        change still renames the preset's provisioned workspace so the SPA sidebar
        stays in step. The sync passes ``npei_syncing`` so mirrored values are not
        echoed back.
        """
        result = super().write(vals)
        if not self.env.context.get('npei_syncing') and 'name' in vals:
            # Keep the harness workspace title in step with the preset name.
            self._push_workspace_title()
        return result

    @api.model
    def action_sync_from_harness(self):
        """Upsert local presets from the harness ``presetWorkspace/list``.

        Manager-gated. Returns a client notification action summarising the
        sync so it can back an ``ir.actions.server`` menu item.

        0.1.2 has no ``disabled`` state, so the mirror never touches the local
        ``active`` archive flag — a preset archived in Odoo stays archived across
        syncs. Each roster entry carries its provisioned ``workspaceId`` directly.
        """
        self._check_manager()
        value = self.env['npei.agent.harness.client']._rpc('agentPreset.list', {})
        entries = value.get('presets') or []
        # Mirroring writes harness values back into Odoo; the flag stops write()
        # from echoing a name change out as a workspace rename.
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
            }
            workspace_id = entry.get('workspaceId')
            if workspace_id:
                vals['workspace_id'] = workspace_id
            # active_test=False so a locally archived mirror (active=False) is
            # found and updated rather than duplicated into a preset_id_uniq
            # violation. `active` is deliberately left untouched (local-only).
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
                'title': _("Presets synced"),
                'message': _("%s preset(s) synced from the harness.", synced),
                'type': 'success',
                'sticky': False,
            },
        }

    def act_lock(self):
        self.write({'is_locked': True})

    def act_unlock(self):
        self.write({'is_locked': False})
