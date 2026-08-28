# -*- coding: utf-8 -*-
"""Provider route templates.

Seed catalog of common OpenAI-/Anthropic-compatible gateways (OpenRouter,
Together, Groq, …) with their wire protocol, base URL, and reasoning format
pre-filled, so the Add Provider Route wizard only needs a template pick and the
API key — mirroring the SPA, which pre-fills these from the pi-ai adapter's
installed catalog.

Shipped as reference data (`data/provider_route_templates.xml`, `noupdate`), so
a manager may edit, disable, or add rows without losing them on upgrade. A blank
base URL is legal: for a provider the pi-ai catalog already ships, the route
inherits the catalog endpoint.
"""
import uuid

from odoo import fields, models

# Kept in sync by hand with the pi-ai adapter's supportedProtocols() /
# SUPPORTED_THINKING_FORMATS (protocol constants).
PROTOCOLS = [
    ('openai-completions', 'OpenAI Completions'),
    ('openai-responses', 'OpenAI Responses'),
    ('anthropic-messages', 'Anthropic Messages'),
]
THINKING_FORMATS = [
    ('openai', 'openai'),
    ('deepseek', 'deepseek'),
    ('openrouter', 'openrouter'),
    ('together', 'together'),
    ('zai', 'zai'),
    ('qwen', 'qwen'),
    ('string-thinking', 'string-thinking'),
    ('ant-ling', 'ant-ling'),
]


class NpeiAgentProviderRouteTemplate(models.Model):
    _name = 'npei.agent.provider.route.template'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _description = 'DeepSeek Harness Provider Route Template'
    _order = 'seq, sequence, name'

    name = fields.Char(
        string='Name',
        required=True, tracking=True,
        help="Display name shown in the Add Provider Route wizard.",
    )
    route_key = fields.Char(
        string='Route Key',
        required=True, tracking=True,
        help="Default route id (providers.<key>), e.g. openrouter.",
    )
    api_protocol = fields.Selection(
        PROTOCOLS,
        string='Wire Protocol',
        required=True,
        default='openai-completions', tracking=True,
        help="Endpoint wire format sent as the profile `api` key.",
    )
    base_url = fields.Char(
        string='Base URL', tracking=True,
        help="Endpoint base; blank inherits the pi-ai catalog endpoint for a "
             "provider it already ships.",
    )
    thinking_format = fields.Selection(
        THINKING_FORMATS,
        string='Thinking Format', tracking=True,
        help="compat.thinkingFormat for the route's models; blank lets pi-ai "
             "guess from the base URL.",
    )
    note = fields.Char(
        string='Note', tracking=True,
        help="Optional hint (where to get the key, model id examples).",
    )
    sequence = fields.Integer(string='Sequence', default=10)
    active = fields.Boolean(default=True, tracking=True)
    seq = fields.Integer('Trình tự*:', default=1)
    is_locked = fields.Boolean('Đã Khóa*:', tracking=True)
    uuid = fields.Char('Mã Chuỗi Ngẫu nhiên*:', copy=False, tracking=True,
                       default=lambda self: str(uuid.uuid4()))

    def act_lock(self):
        self.write({'is_locked': True})

    def act_unlock(self):
        self.write({'is_locked': False})
