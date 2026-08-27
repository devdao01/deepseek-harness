# -*- coding: utf-8 -*-
"""Skill mirror + authoring.

Odoo-side catalog of harness skills. Two roles:

* **Mirror** — :meth:`action_sync_from_harness` upserts metadata from
  ``skill.list`` (which needs a ``sessionId``; the most recently updated mapped
  session is borrowed). Mirror rows carry no ``preset_id`` and never push.
* **Authoring** — a row given a ``preset_id`` owns a skill FILE in that preset's
  workspace: create/write pushes the ``SKILL.md`` via ``skill.write`` (the
  harness writes ``<workspace>/.agents/skills/<skill_key>/SKILL.md``), and unlink
  removes it via ``skill.remove``. The target workspace is the preset's, resolved
  from ``npei.agent.preset.workspace_id``.
"""
import logging
import uuid

from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError

_logger = logging.getLogger(__name__)

MANAGER_GROUP = 'npei_agent_harness.group_npei_agent_manager'
# npei.agent.skill fields whose change alters the pushed SKILL.md.
_SKILL_FILE_FIELDS = ('skill_key', 'description', 'when_to_use', 'content', 'preset_id')


class NpeiAgentSkill(models.Model):
    _name = 'npei.agent.skill'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _description = 'DeepSeek Harness Skill'
    _order = 'seq, name'

    skill_key = fields.Char(
        string='Skill Key',
        required=True,
        index=True,
        copy=False, tracking=True,
        help="Skill identity. The harness ``SkillEntry`` exposes only a "
             "``name``, used here as the key.",
    )
    name = fields.Char(string='Name', tracking=True)
    description = fields.Text(string='Description', tracking=True)
    when_to_use = fields.Char(
        string='When To Use', tracking=True,
        help="The skill's ``whenToUse`` — a one-line hint telling the model when "
             "to invoke it. Synced from ``skill.list`` for mirror rows; pushed to "
             "the SKILL.md frontmatter for authored rows (with a preset).",
    )
    content = fields.Text(
        string='Content', tracking=True,
        help="The SKILL.md instruction body (Markdown, no frontmatter). Pushed "
             "to the harness for authored skills; ``skill.list`` does not carry "
             "it, so a mirror row shows it only after Pull Content.",
    )
    preset_id = fields.Many2one(
        'npei.agent.preset',
        string='Preset',
        ondelete='cascade', tracking=True,
        help="Preset whose workspace this skill file lives in. Set it to AUTHOR "
             "a skill (create/write pushes SKILL.md, unlink removes it). Leave "
             "blank for a read-only mirror row synced from the harness.",
    )
    active = fields.Boolean(default=True, tracking=True)
    seq = fields.Integer('Trình tự*:', default=1)
    is_locked = fields.Boolean('Đã Khóa*:', tracking=True)
    uuid = fields.Char('Mã Chuỗi Ngẫu nhiên*:', copy=False, tracking=True,
                       default=lambda self: str(uuid.uuid4()))

    _sql_constraints = [
        (
            'skill_key_uniq',
            'unique(skill_key)',
            'A skill with this key already exists.',
        ),
    ]

    def _check_manager(self):
        """Raise unless the current user is an NPEI Agent Manager."""
        if not self.env.user.has_group(MANAGER_GROUP):
            raise AccessError(
                _("Only NPEI Agent Managers can sync skills from the harness."))

    @api.model
    def action_sync_from_harness(self):
        """Upsert local skills from the harness ``skill.list``.

        Manager-gated. ``skill.list`` needs a ``sessionId``; the most recently
        updated mapped session is reused. Raises a
        :class:`~odoo.exceptions.UserError` when no session mapping exists.
        Returns a client notification action.
        """
        self._check_manager()
        session = self.env['npei.agent.session'].search(
            [], order='write_date desc', limit=1)
        if not session:
            raise UserError(_(
                "skill.list requires a harness session. Create at least one "
                "session mapping before syncing skills."))
        value = self.env['npei.agent.harness.client']._rpc(
            'skill.list', {'sessionId': session.session_id})
        entries = value.get('skills') or []
        # Mirroring writes harness values in; the flag stops write()/create()
        # from echoing them back out as skill.write.
        model = self.with_context(npei_syncing=True)
        synced = 0
        for entry in entries:
            name = entry.get('name')
            if not name:
                continue
            vals = {
                'name': name,
                'description': entry.get('description') or False,
                'when_to_use': entry.get('whenToUse') or False,
            }
            existing = model.search([('skill_key', '=', name)], limit=1)
            if existing:
                existing.write(vals)
            else:
                model.create(dict(vals, skill_key=name))
            synced += 1
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _("Skills synced"),
                'message': _("%s skill(s) synced from the harness.", synced),
                'type': 'success',
                'sticky': False,
            },
        }

    # ------------------------------------------------------------------
    # Authoring: push/read/remove the SKILL.md file in the preset's workspace
    # ------------------------------------------------------------------
    def _target_workspace_id(self):
        """Return the harness workspace id this skill authors into, or ``None``.

        The target is the preset's provisioned workspace; an authored preset
        stores its id, and a preset that predates that is recovered by path.
        """
        self.ensure_one()
        preset = self.preset_id
        if not preset:
            return None
        if preset.workspace_id:
            return preset.workspace_id
        if preset.workspace_path:
            return preset._resolve_workspace_id_by_path(preset.workspace_path)
        return None

    def _push_skill(self):
        """Push each AUTHORED skill's ``SKILL.md`` to the harness (``skill.write``).

        Writes ``<preset workspace>/.agents/skills/<skill_key>/SKILL.md``.
        Fail-loud: an unreachable harness, an invalid ``skill_key``, or an
        oversized body rolls the Odoo write back. Mirror rows (no ``preset_id``)
        are skipped; the sync suppresses this via ``npei_syncing``.
        """
        if self.env.context.get('npei_syncing'):
            return
        client = self.env['npei.agent.harness.client'].sudo()
        for record in self:
            if not record.preset_id or not record.skill_key:
                continue
            workspace_id = record._target_workspace_id()
            if not workspace_id:
                raise UserError(_(
                    "Preset %s has no harness workspace yet — create a session "
                    "under it first so its workspace is provisioned.",
                    record.preset_id.display_name))
            payload = {
                'workspaceId': workspace_id,
                'name': record.skill_key,
                'description': record.description or '',
                'content': record.content or '',
            }
            if record.when_to_use:
                payload['whenToUse'] = record.when_to_use
            client._rpc('skill.write', payload)

    def _remove_skill_file(self):
        """Best-effort: remove each authored skill's ``SKILL.md`` (``skill.remove``).

        A delete must work even when the harness is unreachable, so a failure is
        logged and swallowed. Mirror rows (no ``preset_id``) touch no file.
        """
        if self.env.context.get('npei_syncing'):
            return
        client = self.env['npei.agent.harness.client'].sudo()
        for record in self:
            if not record.preset_id or not record.skill_key:
                continue
            workspace_id = record._target_workspace_id()
            if not workspace_id:
                continue
            try:
                client._rpc('skill.remove', {
                    'workspaceId': workspace_id, 'name': record.skill_key})
            except UserError as exc:
                _logger.warning(
                    "Failed to remove skill %s: %s", record.skill_key, exc)

    @api.model_create_multi
    def create(self, vals_list):
        """Create the rows, then push any AUTHORED ones to the harness."""
        records = super().create(vals_list)
        records._push_skill()
        return records

    def write(self, vals):
        """Write, then re-push when a SKILL.md-defining field changed."""
        result = super().write(vals)
        if not self.env.context.get('npei_syncing') and (set(_SKILL_FILE_FIELDS) & set(vals)):
            self._push_skill()
        return result

    def unlink(self):
        """Remove each authored skill's harness file before deleting the record."""
        self._remove_skill_file()
        return super().unlink()

    def action_pull_content(self):
        """Fill ``content``/``description``/``when_to_use`` from the harness.

        Reads back the authored ``SKILL.md`` via ``skill.read`` so the Odoo record
        shows its current body (``skill.list`` carries no content). Manager-gated;
        the write runs under ``npei_syncing`` so it does not echo straight back.
        """
        self._check_manager()
        client = self.env['npei.agent.harness.client'].sudo()
        for record in self:
            workspace_id = record._target_workspace_id()
            if not workspace_id or not record.skill_key:
                continue
            value = client._rpc('skill.read', {
                'workspaceId': workspace_id, 'name': record.skill_key})
            record.with_context(npei_syncing=True).write({
                'description': value.get('description') or False,
                'when_to_use': value.get('whenToUse') or False,
                'content': value.get('content') or False,
            })
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _("Skill content pulled"),
                'message': _("Pulled content for %s skill(s).", len(self)),
                'type': 'success',
                'sticky': False,
            },
        }

    def act_lock(self):
        self.write({'is_locked': True})

    def act_unlock(self):
        self.write({'is_locked': False})
