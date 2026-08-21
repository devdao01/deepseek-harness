# -*- coding: utf-8 -*-
"""Skill mirror.

Odoo-side catalog of harness skills, synced from ``skill.list``. Note the
harness ``skill.list`` requires a ``sessionId`` (skills are resolved in the
context of a live session), so the sync borrows the most recently updated
mapped session; it fails loud if none exists yet.
"""
from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError

MANAGER_GROUP = 'npei_agent_harness.group_npei_agent_manager'


class NpeiAgentSkill(models.Model):
    _name = 'npei.agent.skill'
    _description = 'DeepSeek Harness Skill'
    _order = 'name'

    skill_key = fields.Char(
        string='Skill Key',
        required=True,
        index=True,
        copy=False,
        help="Skill identity. The harness ``SkillEntry`` exposes only a "
             "``name``, used here as the key.",
    )
    name = fields.Char(string='Name')
    description = fields.Text(string='Description')
    source = fields.Char(
        string='Source',
        help="Provenance of the skill. Not carried on the harness wire; "
             "populated from ``whenToUse`` when available.",
    )
    active = fields.Boolean(default=True)

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
        synced = 0
        for entry in entries:
            name = entry.get('name')
            if not name:
                continue
            vals = {
                'name': name,
                'description': entry.get('description') or False,
                'source': entry.get('whenToUse') or False,
            }
            existing = self.search([('skill_key', '=', name)], limit=1)
            if existing:
                existing.write(vals)
            else:
                self.create(dict(vals, skill_key=name))
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
