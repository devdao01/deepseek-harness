# -*- coding: utf-8 -*-
"""Provider sign-in wizard (e.g. ChatGPT OAuth) driven from Odoo.

Bridges the harness ``settings/*Authorization`` endpoints into a
button-driven form: Start opens an attempt and shows the sign-in URL; the
user opens it, signs in on the provider's site, copies the authorization
code (or the success redirect URL), pastes it here, and Submits. Refresh
polls the running attempt. The grant is committed inside the harness — no
secret is stored in Odoo.
"""
import logging

from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError

_logger = logging.getLogger(__name__)

MANAGER_GROUP = 'npei_agent_harness.group_npei_agent_manager'


class NpeiAuthorizeProvider(models.TransientModel):
    _name = 'npei.authorize.provider'
    _description = 'DeepSeek Harness Provider Sign-in'

    flow_key = fields.Selection(
        selection='_flow_selection', string='Provider', required=True,
        help="Which credential sign-in to run (from the harness authorization "
             "flows, e.g. ChatGPT OAuth).",
    )
    attempt_id = fields.Char(string='Attempt', readonly=True, copy=False)
    prompt_id = fields.Char(readonly=True, copy=False)
    auth_url = fields.Char(
        string='Sign-in URL', readonly=True, copy=False,
        help="Open this URL, sign in with your provider account, then copy the "
             "authorization code (or the success redirect URL) back here.",
    )
    device_code = fields.Char(string='Device Code', readonly=True, copy=False)
    prompt_message = fields.Char(readonly=True, copy=False)
    answer = fields.Char(
        string='Authorization Code / Redirect URL',
        help="Paste what the provider gave you after signing in.",
    )
    status = fields.Selection(
        [('idle', 'Not started'),
         ('running', 'Waiting for sign-in'),
         ('authorized', 'Signed in'),
         ('cancelled', 'Cancelled'),
         ('failed', 'Failed')],
        string='Status', default='idle', readonly=True, copy=False,
    )
    log_text = fields.Text(string='Progress', readonly=True, copy=False)

    @api.model
    def _flow_selection(self):
        """List the harness authorization flows as selection options."""
        try:
            value = self.env['npei.agent.harness.client'].sudo()._rpc(
                'settings/listAuthorizations', {})
        except UserError:
            return []
        return [(flow['key'], flow.get('label') or flow['key'])
                for flow in (value or {}).get('flows') or []]

    def _check_manager(self):
        if not self.env.user.has_group(MANAGER_GROUP):
            raise AccessError(_(
                "Only NPEI Agent Managers can sign providers in."))

    def _client(self):
        return self.env['npei.agent.harness.client'].sudo()

    def _reopen(self):
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'npei.authorize.provider',
            'res_id': self.id,
            'view_mode': 'form',
            'target': 'new',
        }

    def _apply_poll(self, state):
        """Fold one poll result into the wizard fields."""
        lines = (self.log_text or '').splitlines()
        for notice in (state or {}).get('notices') or []:
            message = notice.get('message') or ''
            if message:
                lines.append(message)
            if notice.get('url'):
                self.auth_url = notice['url']
            if notice.get('code'):
                self.device_code = notice['code']
        self.log_text = '\n'.join(lines[-50:])
        prompt = (state or {}).get('prompt')
        if prompt:
            self.prompt_id = prompt.get('id') or False
            self.prompt_message = prompt.get('message') or False
        settled = (state or {}).get('settled')
        if settled:
            self.status = settled.get('status') or 'failed'
            message = settled.get('message')
            if message:
                self.log_text = '\n'.join((self.log_text or '').splitlines() + [message])
        elif self.status == 'idle':
            self.status = 'running'

    def action_start(self):
        """Begin the attempt and poll once for its sign-in URL."""
        self.ensure_one()
        self._check_manager()
        if not self.flow_key:
            raise UserError(_("Choose a provider to sign in to."))
        client = self._client()
        value = client._rpc('settings/beginAuthorization',
                            {'key': self.flow_key, 'method': None})
        self.attempt_id = (value or {}).get('attemptId') or False
        if not self.attempt_id:
            raise UserError(_("The harness did not start an authorization attempt."))
        self.status = 'running'
        self.auth_url = False
        self.device_code = False
        self.log_text = False
        self._apply_poll(client._rpc('settings/pollAuthorization',
                                     {'attemptId': self.attempt_id}))
        return self._reopen()

    def action_refresh(self):
        """Poll the running attempt for new notices, prompt, or outcome."""
        self.ensure_one()
        self._check_manager()
        if not self.attempt_id:
            raise UserError(_("Start the sign-in first."))
        self._apply_poll(self._client()._rpc('settings/pollAuthorization',
                                             {'attemptId': self.attempt_id}))
        return self._reopen()

    def action_submit_answer(self):
        """Send the pasted code to the pending prompt, then poll the outcome."""
        self.ensure_one()
        self._check_manager()
        if not self.attempt_id or not self.prompt_id:
            raise UserError(_("There is no pending prompt to answer yet; Refresh first."))
        if not (self.answer or '').strip():
            raise UserError(_("Paste the authorization code or redirect URL first."))
        client = self._client()
        delivered = client._rpc('settings/respondAuthorization', {
            'attemptId': self.attempt_id,
            'promptId': self.prompt_id,
            'answer': self.answer.strip(),
        })
        if not delivered:
            raise UserError(_("The prompt expired; Refresh and try again."))
        self.answer = False
        self.prompt_id = False
        self._apply_poll(client._rpc('settings/pollAuthorization',
                                     {'attemptId': self.attempt_id}))
        return self._reopen()

    def action_cancel_attempt(self):
        """Withdraw the running attempt."""
        self.ensure_one()
        self._check_manager()
        if self.attempt_id:
            self._client()._rpc('settings/cancelAuthorization',
                                {'attemptId': self.attempt_id})
            self.status = 'cancelled'
        return self._reopen()
