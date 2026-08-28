# -*- coding: utf-8 -*-
"""Drop the global ``unique(skill_key)`` constraint.

Skill uniqueness moved to per-scope (one preset, or the preset-less mirror
scope), enforced in Python by ``_check_skill_key_unique_per_preset`` so NULL
``preset_id`` counts as a value. Odoo does not auto-drop a removed SQL
constraint, so the legacy one must go or it would still block the same
``skill_key`` under two different presets.
"""


def migrate(cr, version):
    cr.execute(
        "ALTER TABLE npei_agent_skill "
        "DROP CONSTRAINT IF EXISTS npei_agent_skill_skill_key_uniq")
