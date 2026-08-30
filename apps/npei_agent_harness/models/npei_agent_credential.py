# -*- coding: utf-8 -*-
"""Harness credential references: status mirror + write-only set/unset.

Odoo-side management surface for harness credential references (e.g.
``DEEPSEEK_API_KEY``). The harness owns the secret store; this model mirrors
each ref's status from ``credentials/describe`` and pushes secret values with
``credentials/set`` / ``credentials/unset`` (full-token RPC). The secret itself
is never stored in an Odoo column: :attr:`value` is popped from the create/write
vals BEFORE the row is written, pushed to the harness, and always reads back blank.
"""
import logging
import uuid

from odoo import _, api, fields, models
from odoo.exceptions import AccessError

_logger = logging.getLogger(__name__)

MANAGER_GROUP = 'npei_agent_harness.group_npei_agent_manager'


class NpeiAgentCredential(models.Model):
    _name = 'npei.agent.credential'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _description = 'DeepSeek Harness Credential Reference'
    _order = 'seq, ref'

    ref = fields.Char(
        string='Reference',
        required=True,
        index=True,
        copy=False, tracking=True,
        help="Credential reference key owned by the harness, e.g. "
             "``DEEPSEEK_API_KEY``.",
    )
    configured = fields.Boolean(
        string='Configured',
        readonly=True, tracking=True,
        help="Whether the harness holds a value for this ref (reported by "
             "``credentials/describe``).",
    )
    source = fields.Char(
        string='Source',
        readonly=True, tracking=True,
        help="Where the harness resolves this credential from (e.g. env, "
             ".env). Reported by ``credentials/describe``.",
    )
    writable = fields.Boolean(
        string='Writable',
        readonly=True, tracking=True,
        help="Whether the harness lets a full-token client set this ref.",
    )
    value = fields.Char(
        string='New Value',
        password=True,
        help="Write-only secret. On save it is pushed to the harness with "
             "``credentials/set`` and POPPED before the row is written, so it "
             "never lands in an Odoo column; the field always reads back blank.",
    )
    active = fields.Boolean(default=True, tracking=True)
    seq = fields.Integer('Trình tự*:', default=1)
    is_locked = fields.Boolean('Đã Khóa*:', tracking=True)
    uuid = fields.Char('Mã Chuỗi Ngẫu nhiên*:', copy=False, tracking=True,
                       default=lambda self: str(uuid.uuid4()))

    _sql_constraints = [
        (
            'ref_uniq',
            'unique(ref)',
            'A credential with this reference already exists.',
        ),
    ]

    def _check_manager(self):
        """Raise unless the current user is an NPEI Agent Manager."""
        if not self.env.user.has_group(MANAGER_GROUP):
            raise AccessError(
                _("Only NPEI Agent Managers can manage harness credentials."))

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

    def _describe(self, refs):
        """Return the ``credentials/describe`` map for ``refs`` (empty if none).

        :param refs: an iterable of reference keys.
        :rtype: dict
        """
        refs = list(refs)
        if not refs:
            return {}
        value = self.env['npei.agent.harness.client'].sudo()._rpc(
            'credentials/describe', {'refs': refs})
        return value or {}

    def _apply_describe(self, credentials):
        """Update each record's status fields from a describe map, in place.

        A ref absent from ``credentials`` clears configured/source/writable.

        :param dict credentials: the ``credentials/describe`` map keyed by ref.
        """
        for record in self:
            entry = credentials.get(record.ref) or {}
            record.write({
                'configured': bool(entry.get('configured')),
                'source': entry.get('source') or False,
                'writable': bool(entry.get('writable')),
            })

    def _sync_from_harness(self):
        """Refresh these records' status from ``credentials/describe``."""
        self._apply_describe(self._describe(self.mapped('ref')))

    @api.model
    def action_sync_from_harness(self):
        """Refresh every credential's status from the harness. Manager-gated.

        Describes all mirror refs in one ``credentials/describe`` call and
        applies the result. Returns a client notification action so it can back
        an ``ir.actions.server`` menu item.
        """
        self._check_manager()
        records = self.search([])
        records._sync_from_harness()
        return self._notify(
            _("%s credential(s) synced from the harness.", len(records)))

    def _push_secret(self, value):
        """Push one secret to the harness (``credentials/set``) and re-describe.

        Manager-gated. Never persists the value — the caller has already popped
        it from the write/create vals.
        """
        self.ensure_one()
        self._check_manager()
        self.env['npei.agent.harness.client'].sudo()._rpc(
            'credentials/set', {'ref': self.ref, 'value': value})
        self._apply_describe(self._describe([self.ref]))

    @api.model_create_multi
    def create(self, vals_list):
        """Create refs, pushing any ``value`` to the harness (never stored).

        The secret is popped from each vals BEFORE insert, so no Odoo column
        ever holds it; a ref created with a value is set on the harness and its
        status refreshed.
        """
        secrets = [vals.pop('value', None) for vals in vals_list]
        records = super().create(vals_list)
        for record, secret in zip(records, secrets):
            if secret:
                record._push_secret(secret)
        return records

    def write(self, vals):
        """Write, pushing a ``value`` edit to the harness without storing it.

        ``value`` is popped from the write vals (never reaches a column); when
        present, it is set on the harness and the ref re-described.
        """
        secret = vals.pop('value', None)
        result = super().write(vals)
        if secret:
            for record in self:
                record._push_secret(secret)
        return result

    def action_unset(self):
        """Remove this ref's value on the harness (``credentials/unset``).

        Manager-gated and idempotent. Re-describes the ref afterwards.
        """
        self.ensure_one()
        self._check_manager()
        self.env['npei.agent.harness.client'].sudo()._rpc(
            'credentials/unset', {'ref': self.ref})
        self._apply_describe(self._describe([self.ref]))
        return self._notify(_("Credential %s unset on the harness.", self.ref))

    def act_lock(self):
        self.write({'is_locked': True})

    def act_unlock(self):
        self.write({'is_locked': False})
