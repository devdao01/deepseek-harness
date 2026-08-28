# -*- coding: utf-8 -*-
"""Skill mirror + authoring.

Odoo-side catalog of harness skills. Two roles:

* **Mirror** — :meth:`action_sync_from_harness` upserts metadata from
  ``skill.list`` (which needs a ``sessionId``; the most recently updated mapped
  session is borrowed) and pulls each skill's body with a session-addressed
  ``skill.read``. Mirror rows carry no ``preset_id`` and never push.
* **Authoring** — a row given a ``preset_id`` owns a skill FILE in that preset's
  workspace: create/write pushes the ``SKILL.md`` via ``skill.write`` (the
  harness writes ``<workspace>/.agents/skills/<skill_key>/SKILL.md``), and unlink
  removes it via ``skill.remove``. The target workspace is the preset's, resolved
  from ``npei.agent.preset.workspace_id``.
"""
import logging
import re
import unicodedata
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
        index=True,
        copy=False, tracking=True,
        help="Skill identity (kebab-case). Auto-derived from Name when left "
             "blank on create; editable afterwards (a rename moves the harness "
             "file). The harness ``SkillEntry`` exposes only a ``name``, used "
             "here as the key.",
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
             "to the harness for authored skills; filled for mirror rows by "
             "Sync from Harness (or per-row Pull Content), which reads it back "
             "from the harness.",
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
        """Upsert local skills from the harness catalog, including their content.

        Manager-gated. ``skill.list`` needs a ``sessionId``; the most recently
        updated mapped session is reused. ``skill.list`` carries no body, so each
        listed skill's ``SKILL.md`` content (and its authoritative frontmatter)
        is pulled with a session-addressed ``skill.read`` — best-effort, so a
        skill the catalog lists but ``read`` cannot resolve keeps its list
        metadata and an empty content. Raises a
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
        client = self.env['npei.agent.harness.client']
        value = client._rpc('skill.list', {'sessionId': session.session_id})
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
            try:
                body = client._rpc(
                    'skill.read', {'sessionId': session.session_id, 'name': name})
            except UserError as exc:
                body = None
                _logger.info("skill.read content skipped for %s: %s", name, exc)
            if body:
                vals['description'] = body.get('description') or False
                vals['when_to_use'] = body.get('whenToUse') or False
                vals['content'] = body.get('content') or False
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

    def _slugify_skill_key(self, text):
        """Turn free text into a kebab-case skill key (``[a-z0-9]+(-[a-z0-9]+)*``).

        Vietnamese diacritics are stripped and ``đ``/``Đ`` mapped to ``d`` (they
        do not NFKD-decompose); any other run of non-alphanumerics collapses to a
        single ``-``. Returns ``''`` when nothing usable remains.
        """
        text = (text or '').replace('đ', 'd').replace('Đ', 'D')
        text = unicodedata.normalize('NFKD', text)
        text = ''.join(ch for ch in text if not unicodedata.combining(ch))
        return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')

    def _unique_skill_key(self, base):
        """Return ``base`` — or ``base-2``, ``base-3``, … — not yet used as a key."""
        candidate = base
        index = 1
        while self.with_context(active_test=False).search_count(
                [('skill_key', '=', candidate)]):
            index += 1
            candidate = '%s-%d' % (base, index)
        return candidate

    @api.onchange('name')
    def _onchange_name_fill_skill_key(self):
        """Preview the auto key: fill a blank ``skill_key`` from ``name`` once.

        Only fills while the key is empty, so a hand-typed or already-derived key
        keeps following its own edits, not the name.
        """
        if not self.skill_key and self.name:
            base = self._slugify_skill_key(self.name)
            if base:
                self.skill_key = self._unique_skill_key(base)

    def copy(self, default=None):
        """Duplicate as a mirror row: drop ``preset_id`` so the copy authors no
        harness file (attach a preset later to publish it). ``skill_key`` is
        ``copy=False``, so mint a fresh ``<key>-copy`` (deduplicated) to satisfy
        the unique key.
        """
        self.ensure_one()
        default = dict(default or {})
        default.setdefault('preset_id', False)
        if not default.get('skill_key') and self.skill_key:
            default['skill_key'] = self._unique_skill_key('%s-copy' % self.skill_key)
        if not default.get('name') and self.name:
            default['name'] = _('%s (copy)', self.name)
        return super().copy(default)

    @api.model_create_multi
    def create(self, vals_list):
        """Fill a blank ``skill_key`` from ``name`` (deduplicated), then push any
        AUTHORED rows to the harness. A row with neither a key nor a usable name is
        rejected — the key is the file identity.
        """
        for vals in vals_list:
            if not vals.get('skill_key'):
                base = self._slugify_skill_key(vals.get('name'))
                if not base:
                    raise UserError(_(
                        "A skill needs a Name (or an explicit Skill Key) to "
                        "derive its key from."))
                vals['skill_key'] = self._unique_skill_key(base)
        records = super().create(vals_list)
        records._push_skill()
        return records

    def write(self, vals):
        """Write, then re-push when a SKILL.md-defining field changed.

        A ``skill_key`` rename (or a ``preset_id`` re-target) moves the file, so
        the OLD ``(workspace, skill_key)`` is snapshotted before the write and its
        SKILL.md removed after — otherwise the write would author the new file and
        orphan the old one, leaving a duplicate skill on the harness.
        """
        syncing = self.env.context.get('npei_syncing')
        touches_target = bool({'skill_key', 'preset_id'} & set(vals))
        before = {}
        if not syncing and touches_target:
            for record in self:
                workspace_id = record._target_workspace_id() if record.preset_id else None
                if workspace_id and record.skill_key:
                    before[record.id] = (workspace_id, record.skill_key)
        result = super().write(vals)
        if not syncing and (set(_SKILL_FILE_FIELDS) & set(vals)):
            if touches_target:
                client = self.env['npei.agent.harness.client'].sudo()
                for record in self:
                    old = before.get(record.id)
                    new_ws = record._target_workspace_id() if record.preset_id else None
                    new = (new_ws, record.skill_key) if new_ws and record.skill_key else None
                    if old and old != new:
                        try:
                            client._rpc('skill.remove', {'workspaceId': old[0], 'name': old[1]})
                        except UserError as exc:
                            _logger.warning(
                                "Failed to remove renamed skill %s: %s", old[1], exc)
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
