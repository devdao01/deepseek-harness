# -*- coding: utf-8 -*-
"""LLM provider mirror.

Odoo-side catalog of harness LLM providers. Harness 0.1.2 deleted the
``llm.providers`` route-metadata endpoint, so the roster is DERIVED from
``session/modelCatalog``: each catalog ``group`` is a provider (id + display
name) and ``routableProviders`` marks the ones currently able to serve a
request. The harness no longer reports a provider's ``settingsNs`` /
``settingsPath`` / ``declared`` metadata, so those fields are NOT synced — a
manager sets ``settings_ns`` by hand (it is required to push configurable models
via ``settings/mutate``). This mirror stays a read-only management surface plus
Odoo archiving.

The harness routable flag (whether the provider can serve) is stored as
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
        string='Provider',
        required=True,
        index=True,
        copy=False, tracking=True,
        help="Provider id owned by the harness (``ProviderView.provider``).",
    )
    display_name = fields.Char(
        string='Display Name', tracking=True,
        help="Human-readable provider name from the model catalog group.",
    )
    settings_ns = fields.Char(
        string='Settings Namespace', tracking=True,
        help="Settings namespace this provider reads its configuration from "
             "(raw key; the settings_id match partner).",
    )
    settings_id = fields.Many2one(
        'npei.agent.setting',
        string='Settings Namespace Record',
        index=True,
        ondelete='set null', tracking=True,
        help="The settings-namespace mirror matching settings_ns; blank until "
             "settings are synced. Many providers may share one namespace.",
    )
    settings_path = fields.Char(
        string='Settings Path', tracking=True,
        help="The harness ``settingsPath`` segments joined with ``/``.",
    )
    route_active = fields.Boolean(
        string='Route Active', tracking=True,
        help="Whether the harness catalog reports this provider as routable "
             "(present in ``modelCatalog.routableProviders``).",
    )
    declared = fields.Boolean(
        string='Declared', tracking=True,
        help="Legacy flag from the removed ``llm.providers`` endpoint; no longer "
             "synced in 0.1.2 (kept for existing data).",
    )
    active = fields.Boolean(default=True, tracking=True)
    seq = fields.Integer('Trình tự*:', default=1)
    is_locked = fields.Boolean('Đã Khóa*:', tracking=True)
    uuid = fields.Char('Mã Chuỗi Ngẫu nhiên*:', copy=False, tracking=True,
                       default=lambda self: str(uuid.uuid4()))
    model_ids = fields.One2many(
        'npei.agent.provider.model',
        'provider_id',
        string='Configured Models',
        help="Editable models array pushed to this provider's settings "
             "namespace (settings[ns].user[...path].models).",
    )
    catalog_model_ids = fields.One2many(
        'npei.agent.model',
        'provider_id',
        string='Catalog Models',
        help="Read-only resolved catalog models (session/modelCatalog) whose "
             "group id matches this provider.",
    )
    catalog_model_count = fields.Integer(
        string='Catalog Model Count',
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
            'name': _("Catalog Models"),
            'res_model': 'npei.agent.model',
            'view_mode': 'tree,form',
            'domain': [('provider_id', '=', self.id)],
            'context': {'default_provider_id': self.id},
        }

    _sql_constraints = [
        (
            'provider_uniq',
            'unique(provider)',
            'A provider with this id already exists.',
        ),
    ]

    def _check_manager(self):
        """Raise unless the current user is an NPEI Agent Manager."""
        if not self.env.user.has_group(MANAGER_GROUP):
            raise AccessError(
                _("Only NPEI Agent Managers can sync providers from the harness."))

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
        """Upsert local providers derived from ``session/modelCatalog``.

        Manager-gated. Each catalog ``group`` is a provider; ``routableProviders``
        marks the ones able to serve. 0.1.2 no longer supplies ``settingsNs`` /
        ``settingsPath`` / ``declared``, so those fields are left untouched
        (preserving any manually set ``settings_ns``). Returns a client
        notification action so it can back an ``ir.actions.server`` menu item.
        """
        self._check_manager()
        value = self.env['npei.agent.harness.client'].sudo()._rpc(
            'session.modelCatalog', {})
        groups = value.get('groups') or []
        routable = set(value.get('routableProviders') or [])
        # A group carries a display name; a routable provider with an empty
        # catalog appears only in `routableProviders`, so union the two.
        names = {group.get('id'): group.get('name')
                 for group in groups if group.get('id')}
        provider_ids = [pid for pid in
                        list(names.keys()) + [p for p in routable if p not in names]
                        if pid]
        synced = 0
        for provider in provider_ids:
            vals = {
                'display_name': names.get(provider) or provider,
                'route_active': provider in routable,
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
        return self._notify(_("%s provider(s) synced from the harness.", synced))

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
