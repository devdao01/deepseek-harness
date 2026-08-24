# -*- coding: utf-8 -*-
"""Harness settings namespaces: mirror + whole-section replace.

Odoo-side management surface for the harness settings document, one record per
namespace. :meth:`action_sync_from_harness` mirrors each namespace from
``settings.describe`` (redacted resolved value + raw user section + revision);
:meth:`action_save` pushes an edited user section back with ``settings.replace``
using the mirrored ``revision`` as ``expectedRevision`` so a concurrent change
is refused rather than silently overwritten.
"""
import json
import logging

from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError

_logger = logging.getLogger(__name__)

MANAGER_GROUP = 'npei_agent_harness.group_npei_agent_manager'


class NpeiAgentSetting(models.Model):
    _name = 'npei.agent.setting'
    _description = 'DeepSeek Harness Settings Namespace'
    _order = 'ns'

    ns = fields.Char(
        string='Namespace',
        required=True,
        index=True,
        copy=False,
        help="Settings namespace key owned by the harness.",
    )
    applies = fields.Selection(
        [('live', 'Live'), ('restart', 'Restart')],
        string='Applies',
        readonly=True,
        help="Whether a change takes effect live or needs a harness restart.",
    )
    has_document = fields.Boolean(
        string='Has Document',
        readonly=True,
        help="Whether the harness has a persisted settings document.",
    )
    revision = fields.Integer(
        string='Revision',
        readonly=True,
        help="Namespace revision echoed as ``expectedRevision`` on save so a "
             "concurrent change is refused.",
    )
    value_json = fields.Text(
        string='Resolved Value',
        readonly=True,
        help="Pretty-printed redacted resolved value (base + user), read-only.",
    )
    user_json = fields.Text(
        string='User Section',
        help="Pretty-printed raw user section. Edit and Save to replace it on "
             "the harness.",
    )
    provider_ids = fields.One2many(
        'npei.agent.provider',
        'settings_id',
        string='Providers',
        help="Provider routes that read their configuration from this "
             "namespace.",
    )

    _sql_constraints = [
        (
            'ns_uniq',
            'unique(ns)',
            'A settings namespace with this key already exists.',
        ),
    ]

    def _check_manager(self):
        """Raise unless the current user is an NPEI Agent Manager."""
        if not self.env.user.has_group(MANAGER_GROUP):
            raise AccessError(
                _("Only NPEI Agent Managers can manage harness settings."))

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

        Covers the fields both ``settings.describe`` entries and
        ``settings.replace`` return: applies, revision, resolved value, and the
        raw user section. ``has_document`` is namespace-independent and set by
        the sync path only.

        :param dict view: a namespace view (``settings.describe`` entry or the
            ``settings.replace`` result).
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
        """Upsert local namespaces from the harness ``settings.describe``.

        Manager-gated. Returns a client notification action so it can back an
        ``ir.actions.server`` menu item.
        """
        self._check_manager()
        value = self.env['npei.agent.harness.client'].sudo()._rpc('settings.describe', {})
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
            _("%s settings namespace(s) synced from the harness.", synced))

    def action_save(self):
        """Replace this namespace's user section on the harness.

        Manager-gated. Parses :attr:`user_json` (must be a JSON object) and calls
        ``settings.replace`` with the mirrored ``revision`` as
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
                "The user section for %(ns)s is not valid JSON: %(error)s",
                ns=self.ns, error=exc))
        if not isinstance(section, dict):
            raise UserError(_(
                "The user section for %s must be a JSON object.", self.ns))
        try:
            view = self.env['npei.agent.harness.client'].sudo()._rpc(
                'settings.replace', {
                    'ns': self.ns,
                    'section': section,
                    'expectedRevision': self.revision,
                })
        except UserError as exc:
            raise UserError(_(
                "Saving settings namespace %(ns)s failed: %(error)s\n"
                "If another client changed it, use 'Sync from Harness' to reload "
                "the current revision, then reapply your edit.",
                ns=self.ns, error=exc))
        self.write(self._vals_from_view(view))
        return self._notify(
            _("Settings namespace %(ns)s saved (revision %(rev)s).",
              ns=self.ns, rev=self.revision))
