# -*- coding: utf-8 -*-
"""Editable per-provider model catalog.

The SPA configures a provider's models by editing the ``models`` array in that
provider's settings namespace user layer (``settings[ns].user[...path].models``),
one entry ``{id, name?, contextWindow?, maxTokens?}`` per model, written with
``settings.mutate``. This model is the Odoo equivalent: each record is one row
of a provider's ``models`` array, and every create/write/unlink recomputes the
whole array and pushes it back with ``settings.mutate`` on the provider's
``settings_ns`` at ``settings_path + ['models']``.

Emptying a provider's rows unsets the ``models`` path (return to the inherited
catalog) rather than storing an empty array, matching the SPA's reset semantics.

Distinct from :class:`~odoo.addons.npei_agent_harness.models.npei_agent_model`,
which is the READ-ONLY mirror of the resolved ``llm.models`` catalog. This model
is the user-layer override the manager edits.
"""
import uuid

from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError

MANAGER_GROUP = 'npei_agent_harness.group_npei_agent_manager'


class NpeiAgentProviderModel(models.Model):
    _name = 'npei.agent.provider.model'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _description = 'DeepSeek Harness Provider Model (configurable)'
    _order = 'seq, provider_id, sequence, id'

    provider_id = fields.Many2one(
        'npei.agent.provider',
        string='Provider',
        required=True,
        index=True,
        ondelete='cascade', tracking=True,
        help="The provider whose settings-namespace models array owns this row.",
    )
    sequence = fields.Integer(
        string='Sequence',
        default=10,
        help="Order within the provider's models array.",
    )
    model_id = fields.Char(
        string='Model ID',
        required=True, tracking=True,
        help="Model id sent to the adapter (``models[].id``).",
    )
    name = fields.Char(
        string='Name', tracking=True,
        help="Optional display name (``models[].name``); blank omits the key.",
    )
    context_window = fields.Integer(
        string='Context Window', tracking=True,
        help="Optional context capacity (``models[].contextWindow``); 0 omits "
             "the key so the adapter default applies.",
    )
    max_tokens = fields.Integer(
        string='Max Tokens', tracking=True,
        help="Optional output cap (``models[].maxTokens``); 0 omits the key so "
             "the adapter default applies.",
    )
    active = fields.Boolean(default=True, tracking=True)
    seq = fields.Integer('Trình tự*:', default=1)
    is_locked = fields.Boolean('Đã Khóa*:', tracking=True)
    uuid = fields.Char('Mã Chuỗi Ngẫu nhiên*:', copy=False, tracking=True,
                       default=lambda self: str(uuid.uuid4()))

    _sql_constraints = [
        (
            'provider_model_uniq',
            'unique(provider_id, model_id)',
            'This provider already configures a model with that id.',
        ),
    ]

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _check_manager(self):
        """Raise unless the current user is an NPEI Agent Manager."""
        if not self.env.user.has_group(MANAGER_GROUP):
            raise AccessError(
                _("Only NPEI Agent Managers can configure provider models."))

    @api.model
    def _path_segments(self, provider):
        """The provider's ``settings_path`` split into non-empty segments."""
        return [seg for seg in (provider.settings_path or '').split('/') if seg]

    @api.model
    def _nav(self, root, segments):
        """Walk ``segments`` down a nested dict; ``None`` if any hop is absent."""
        node = root
        for seg in segments:
            if not isinstance(node, dict):
                return None
            node = node.get(seg)
        return node

    @api.model
    def _entry_payload(self, row):
        """One ``models[]`` entry from a record; optional keys omitted when blank."""
        entry = {'id': row.model_id}
        if row.name:
            entry['name'] = row.name
        if row.context_window:
            entry['contextWindow'] = row.context_window
        if row.max_tokens:
            entry['maxTokens'] = row.max_tokens
        return entry

    def _push_models(self, providers):
        """Recompute and push each provider's ``models`` array via ``settings.mutate``.

        A non-empty array is ``set`` at ``settings_path + ['models']``; an empty
        one is ``unset`` (return to the inherited catalog). Skipped entirely
        during a sync (``npei_syncing`` context), so mirrored rows are not echoed
        straight back to the harness.

        :param providers: the ``npei.agent.provider`` records to repush.
        :raises UserError: when a provider has no ``settings_ns`` to write to.
        """
        if self.env.context.get('npei_syncing'):
            return
        client = self.env['npei.agent.harness.client'].sudo()
        for provider in providers:
            if not provider.settings_ns:
                raise UserError(_(
                    "Provider %s has no settings namespace; sync providers from "
                    "the harness before configuring its models.",
                    provider.provider or provider.display_name or provider.id))
            segments = self._path_segments(provider)
            rows = self.search([('provider_id', '=', provider.id)])
            array = [self._entry_payload(row) for row in rows]
            op = ({'op': 'set', 'path': segments + ['models'], 'value': array}
                  if array
                  else {'op': 'unset', 'path': segments + ['models']})
            client._rpc('settings.mutate', {'ns': provider.settings_ns, 'ops': [op]})

    # ------------------------------------------------------------------
    # CRUD → push
    # ------------------------------------------------------------------
    @api.model_create_multi
    def create(self, vals_list):
        """Create rows, then push each affected provider's models array once."""
        records = super().create(vals_list)
        records._push_models(records.provider_id)
        return records

    def write(self, vals):
        """Write rows, then repush the union of the old and new providers."""
        providers = self.provider_id
        result = super().write(vals)
        self._push_models(providers | self.provider_id)
        return result

    def unlink(self):
        """Unlink rows, then repush each affected provider's (now shorter) array."""
        providers = self.provider_id
        result = super().unlink()
        self.env['npei.agent.provider.model']._push_models(providers)
        return result

    # ------------------------------------------------------------------
    # Sync
    # ------------------------------------------------------------------
    @api.model
    def action_sync_from_harness(self):
        """Mirror every provider's effective ``models`` into editable rows.

        Manager-gated. Reads ``settings.describe`` once, and for each
        ``npei.agent.provider`` navigates the namespace's resolved ``value``
        (falling back to the raw ``user`` section) down ``settings_path`` to the
        ``models`` array, upserting one row per entry under ``npei_syncing`` so
        the mirror write is not pushed straight back. Rows whose id disappeared
        upstream are removed.

        :rtype: dict
        :returns: a success notification action (backs an ``ir.actions.server``).
        """
        self._check_manager()
        described = self.env['npei.agent.harness.client'].sudo()._rpc(
            'settings.describe', {})
        by_ns = {entry.get('ns'): entry
                 for entry in (described.get('namespaces') or [])
                 if entry.get('ns')}
        synced = 0
        for provider in self.env['npei.agent.provider'].search([]):
            entry = by_ns.get(provider.settings_ns)
            if entry is None:
                continue
            segments = self._path_segments(provider)
            profile = self._nav(entry.get('value'), segments)
            models_value = profile.get('models') if isinstance(profile, dict) else None
            if models_value is None:
                user_profile = self._nav(entry.get('user'), segments)
                models_value = (user_profile.get('models')
                                if isinstance(user_profile, dict) else None)
            synced += self.with_context(npei_syncing=True)._sync_provider_rows(
                provider, models_value or [])
        return self.env['npei.agent.provider']._notify(
            _("%s provider model(s) synced from the harness.", synced))

    @api.model
    def _sync_provider_rows(self, provider, models_value):
        """Upsert one provider's rows from a ``models`` array; drop vanished ids.

        Runs under ``npei_syncing`` so the upserts do not re-push. Returns the
        number of rows kept (created or updated).
        """
        seen = set()
        kept = 0
        for index, entry in enumerate(models_value):
            if not isinstance(entry, dict):
                continue
            model_id = entry.get('id')
            if not model_id:
                continue
            seen.add(model_id)
            vals = {
                'sequence': (index + 1) * 10,
                'name': entry.get('name') or False,
                'context_window': entry.get('contextWindow') or 0,
                'max_tokens': entry.get('maxTokens') or 0,
            }
            existing = self.search([
                ('provider_id', '=', provider.id),
                ('model_id', '=', model_id)], limit=1)
            if existing:
                existing.write(vals)
            else:
                self.create(dict(vals, provider_id=provider.id, model_id=model_id))
            kept += 1
        stale = self.search([
            ('provider_id', '=', provider.id),
            ('model_id', 'not in', list(seen))]) if seen else self.search([
                ('provider_id', '=', provider.id)])
        stale.unlink()
        return kept

    def act_lock(self):
        self.write({'is_locked': True})

    def act_unlock(self):
        self.write({'is_locked': False})
