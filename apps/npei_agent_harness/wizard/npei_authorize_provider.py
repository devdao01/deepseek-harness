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
import time

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
    prompt_kind = fields.Char(readonly=True, copy=False)
    prompt_message = fields.Char(readonly=True, copy=False)
    option_ids = fields.One2many(
        'npei.authorize.provider.option', 'wizard_ref',
        string='Options', readonly=True,
        help="Choices of the pending select prompt (e.g. Browser vs Device "
             "code); picking one answers the flow immediately. Device code "
             "suits Odoo: open the URL, enter the code — no localhost "
             "callback needed.",
    )
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
    route_declared = fields.Boolean(readonly=True, copy=False)
    route_reasoning = fields.Selection(
        [('', 'Provider default'),
         ('minimal', 'Minimal'), ('low', 'Low'), ('medium', 'Medium'),
         ('high', 'High'), ('xhigh', 'Extra high')],
        string='Default Reasoning', default='medium',
        help="Reasoning effort the declared route defaults to. Without one "
             "the harness reports no default and the model picker opens with "
             "no effort chosen; a level unsupported by a given model is "
             "ignored for that model.",
    )

    @api.model
    def _flow_selection(self):
        """List the harness authorization flows as selection options."""
        try:
            value = self.env['npei.agent.harness.client'].sudo()._rpc(
                'settings/listAuthorizations', {})
        except UserError:
            return []
        # Only OAuth flows (browser sign-in): api-key-only providers are
        # configured through the Models settings page instead, and offering
        # them here would open a typed-key prompt this wizard is not for.
        return [(flow['key'], flow.get('label') or flow['key'])
                for flow in (value or {}).get('flows') or []
                if any(m.get('id') == 'oauth' for m in flow.get('methods') or [])]

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

    def _poll_budget(self, client, seconds=8.0, wait_settled=False):
        """Poll the attempt until there is something to render.

        The flow runs detached on the harness, so its sign-in URL arrives a
        beat after begin; a single immediate poll would show an empty screen.
        This drains repeatedly (short sleeps) up to a budget, folding every
        result.

        ``wait_settled`` is for after an answer was delivered: the sign-in URL
        is already on screen from the previous step, so returning on it would
        end the wait before the harness finished exchanging the code — only a
        settled outcome (or a NEW prompt) ends the wait then.
        """
        deadline = time.monotonic() + seconds
        while True:
            self._apply_poll(client._rpc('settings/pollAuthorization',
                                         {'attemptId': self.attempt_id}))
            # A method picker offering Browser login is answered here without
            # showing it: the browser path is this wizard's whole flow (open
            # the URL, sign in, paste the redirect URL back).
            if self.prompt_kind == 'select':
                browser = self.option_ids.filtered(lambda o: o.option_id == 'browser')
                if browser:
                    delivered = client._rpc('settings/respondAuthorization', {
                        'attemptId': self.attempt_id,
                        'promptId': self.prompt_id,
                        'answer': 'browser',
                    })
                    if delivered:
                        self._clear_prompt()
                        continue
            # Return as soon as there is something to act on: a remaining
            # prompt (the paste box, or a picker with no browser option), a
            # sign-in URL, or a settled outcome. After an answer, only the
            # outcome or a new prompt counts (see wait_settled).
            if self.status in ('authorized', 'cancelled', 'failed'):
                return
            if self.prompt_id:
                return
            if not wait_settled and self.auth_url:
                return
            if time.monotonic() >= deadline:
                return
            time.sleep(0.4)

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
            self.prompt_kind = prompt.get('kind') or False
            self.prompt_message = prompt.get('message') or False
            self.option_ids.unlink()
            self.option_ids = [(0, 0, {
                'option_id': option['id'],
                'name': option.get('label') or option['id'],
                'description': option.get('description') or False,
            }) for option in prompt.get('options') or [] if option.get('id')]
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
        # Omit method entirely (not null): the wire param is string|undefined
        # and rejects a JSON null. The flow's first method is used.
        value = client._rpc('settings/beginAuthorization', {'key': self.flow_key})
        self.attempt_id = (value or {}).get('attemptId') or False
        if not self.attempt_id:
            raise UserError(_("The harness did not start an authorization attempt."))
        self.status = 'running'
        self.auth_url = False
        self.device_code = False
        self.log_text = False
        self._poll_budget(client)
        return self._reopen()

    def action_open_auth_url(self):
        """Open the provider's sign-in page in a new browser tab."""
        self.ensure_one()
        if not self.auth_url:
            raise UserError(_("There is no sign-in URL yet; Start the sign-in first."))
        return {'type': 'ir.actions.act_url', 'url': self.auth_url, 'target': 'new'}

    def action_refresh(self):
        """Poll the running attempt for new notices, prompt, or outcome."""
        self.ensure_one()
        self._check_manager()
        if not self.attempt_id:
            raise UserError(_("Start the sign-in first."))
        # A refresh after the code was submitted is waiting for the outcome,
        # so it must not return on the URL that is already on screen.
        self._poll_budget(self._client(), seconds=10.0, wait_settled=not self.prompt_id)
        return self._reopen()

    def action_submit_answer(self):
        """Send the pasted code to the pending prompt, then poll the outcome."""
        self.ensure_one()
        self._check_manager()
        if not self.attempt_id or not self.prompt_id:
            raise UserError(_("There is no pending prompt to answer yet; Refresh first."))
        reply = (self.answer or '').strip()
        if not reply:
            raise UserError(_("Paste the authorization code or redirect URL first."))
        client = self._client()
        delivered = client._rpc('settings/respondAuthorization', {
            'attemptId': self.attempt_id,
            'promptId': self.prompt_id,
            'answer': reply,
        })
        if not delivered:
            raise UserError(_("The prompt expired; Refresh and try again."))
        self._clear_prompt()
        self._poll_budget(client, seconds=25.0, wait_settled=True)
        return self._reopen()

    def action_declare_route(self):
        """Declare the signed-in provider as an llm-pi-ai route.

        The flow key is ``<settings-ns>/<provider-id>`` (e.g.
        ``llm-pi-ai/openai-codex``): this sets ``providers.<id> = {}`` in that
        settings namespace so the route inherits the catalog provider's
        endpoint, wire, and models, authenticated by the sign-in grant. Its
        models then appear in the harness picker. Written unconditionally
        (expectedRevision omitted); an existing route config is not disturbed
        because 'set' at the provider path only adds the key when absent.
        """
        self.ensure_one()
        self._check_manager()
        if self.status != 'authorized':
            raise UserError(_("Sign in successfully before declaring the route."))
        if '/' not in (self.flow_key or ''):
            raise UserError(_("This provider has no settings route to declare."))
        namespace, provider_id = self.flow_key.split('/', 1)
        client = self._client()
        described = client._rpc('settings/describe', {})
        current = next((ns for ns in (described or {}).get('namespaces') or []
                        if ns.get('ns') == namespace), None)
        existing_providers = ((current or {}).get('user') or {}).get('providers') or {}
        if provider_id in existing_providers:
            self.route_declared = True
            self.log_text = '\n'.join((self.log_text or '').splitlines()
                                       + [_("Route '%s' already declared.") % provider_id])
            return self._reopen()
        route = {'reasoning': self.route_reasoning} if self.route_reasoning else {}
        client._rpc('settings/mutate', {
            'ns': namespace,
            'ops': [{'op': 'set', 'path': ['providers', provider_id], 'value': route}],
            'expectedRevision': (current or {}).get('revision'),
        })
        self.route_declared = True
        self.log_text = '\n'.join((self.log_text or '').splitlines()
                                   + [_("Route '%s' declared; its models are now available.") % provider_id])
        return self._reopen()

    def _clear_prompt(self):
        self.answer = False
        self.prompt_id = False
        self.prompt_kind = False
        self.prompt_message = False
        self.option_ids.unlink()

    def _respond_option(self, option_id):
        """Answer the pending select prompt with one option id."""
        self.ensure_one()
        self._check_manager()
        if not self.attempt_id or not self.prompt_id:
            raise UserError(_("There is no pending prompt to answer yet; Refresh first."))
        client = self._client()
        delivered = client._rpc('settings/respondAuthorization', {
            'attemptId': self.attempt_id,
            'promptId': self.prompt_id,
            'answer': option_id,
        })
        if not delivered:
            raise UserError(_("The prompt expired; Refresh and try again."))
        self._clear_prompt()
        self._poll_budget(client, seconds=25.0, wait_settled=True)
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


class NpeiAuthorizeProviderOption(models.TransientModel):
    """One choice of the wizard's pending select prompt."""

    _name = 'npei.authorize.provider.option'
    _description = 'DeepSeek Harness Sign-in Choice'

    wizard_ref = fields.Many2one(
        'npei.authorize.provider', required=True, ondelete='cascade')
    option_id = fields.Char(required=True)
    name = fields.Char(string='Option', readonly=True)
    description = fields.Char(readonly=True)

    def action_pick(self):
        """Answer the pending prompt with this option."""
        self.ensure_one()
        return self.wizard_ref._respond_option(self.option_id)
