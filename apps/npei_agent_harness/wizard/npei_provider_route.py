# -*- coding: utf-8 -*-
"""Add a provider route wizard.

Declares one OpenAI-/Anthropic-compatible provider route (OpenRouter, Together,
a self-hosted gateway, …) on the ``llm-pi-ai`` adapter without hand-editing raw
settings JSON. The route profile is written with a **path-scoped**
``settings/mutate`` (``{op:'set', path:['providers', <key>], value:{…}}``) so it
adds the route and leaves every other route in the section untouched — unlike the
whole-section replace behind :class:`npei.agent.setting`.

After the write the wizard syncs the provider mirror so the new route appears
under Providers, where its models are configured through
``npei.agent.provider.model``.

The ``api`` protocol list and ``compat.thinkingFormat`` list mirror the pi-ai
adapter's ``supportedProtocols()`` / ``SUPPORTED_THINKING_FORMATS`` (protocol
constants; kept in sync with the adapter by hand).
"""
import re

from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError

MANAGER_GROUP = 'npei_agent_harness.group_npei_agent_manager'

# The pi-ai settings namespace that owns configured provider routes.
PI_AI_NS = 'llm-pi-ai'

# Wire protocols a hand-declared route may name (pi-ai supportedProtocols()).
PROTOCOLS = [
    ('openai-completions', 'OpenAI Completions'),
    ('openai-responses', 'OpenAI Responses'),
    ('anthropic-messages', 'Anthropic Messages'),
]

# Reasoning-dispatch formats (pi-ai SUPPORTED_THINKING_FORMATS); blank lets pi-ai
# guess from the base URL.
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

ROUTE_KEY_PATTERN = re.compile(r'^[a-z0-9][a-z0-9-]*$')


class NpeiProviderRoute(models.TransientModel):
    _name = 'npei.agent.provider.route'
    _description = 'DeepSeek Harness Add Provider Route'

    settings_ns = fields.Char(
        string='Không gian tên cài đặt',
        required=True,
        default=PI_AI_NS,
        help="Không gian tên adapter pi-ai sở hữu các tuyến nhà cung cấp. Giữ là "
             "llm-pi-ai trừ khi triển khai đổi tên.",
    )
    template_id = fields.Many2one(
        'npei.agent.provider.route.template',
        string='Từ mẫu',
        help="Chọn một cổng kết nối quen thuộc để điền sẵn mã/giao thức/URL cơ sở/"
             "định dạng suy luận; chỉ cần nhập khóa API.",
    )
    route_key = fields.Char(
        string='Mã tuyến',
        required=True,
        help="Mã tuyến dưới providers.<key>, chữ thường (ví dụ openrouter). "
             "Cũng được đóng dấu lên nhà cung cấp của mỗi mô hình.",
    )
    display_name = fields.Char(
        string='Tên hiển thị',
        help="Tên dễ đọc hiển thị trong các bộ chọn.",
    )
    api_protocol = fields.Selection(
        PROTOCOLS,
        string='Giao thức wire',
        required=True,
        default='openai-completions',
        help="Định dạng wire điểm cuối (gửi dưới dạng khóa `api` trong profile). "
             "OpenRouter và hầu hết cổng kết nối dùng openai-completions. "
             "Đặt là api_protocol để không che khuất module odoo `api`.",
    )
    base_url = fields.Char(
        string='URL cơ sở',
        help="Điểm cuối cơ sở, ví dụ https://openrouter.ai/api/v1. Để trống kế thừa "
             "điểm cuối từ danh mục pi-ai cho nhà cung cấp mà nó đã có sẵn.",
    )
    api_key_env = fields.Char(
        string='Tham chiếu thông tin xác thực',
        help="Tên tham chiếu thông tin xác thực mà tuyến phân giải khóa qua đó "
             "(apiKeyEnv). Để trống sẽ tạo <ROUTE_KEY>_API_KEY.",
    )
    api_key = fields.Char(
        string='Khóa API',
        help="Giá trị khóa tùy chọn được đẩy vào kho thông tin xác thực ngay bây giờ "
             "(credentials.set); không bao giờ lưu trong Odoo.",
    )
    thinking_format = fields.Selection(
        THINKING_FORMATS,
        string='Định dạng suy luận',
        help="compat.thinkingFormat cho các mô hình của tuyến; để trống để pi-ai "
             "tự đoán từ URL cơ sở. OpenRouter dùng openrouter.",
    )
    models_text = fields.Text(
        string='Mô hình',
        help="Một mô hình mỗi dòng: `id` hoặc `id | Tên hiển thị` "
             "(ví dụ openai/gpt-4o | GPT-4o). Tùy chọn — thêm sau trong "
             "Mô hình đã Cấu hình của nhà cung cấp.",
    )

    def _check_manager(self):
        """Raise unless the current user is an NPEI Agent Manager."""
        if not self.env.user.has_group(MANAGER_GROUP):
            raise AccessError(
                _("Chỉ Quản trị Agent NPEI mới có thể thêm tuyến nhà cung cấp."))

    @api.model
    def _derive_key_ref(self, route_key):
        """The conventional credential reference for a route (``<KEY>_API_KEY``)."""
        upper = re.sub(r'[^A-Z0-9]+', '_', (route_key or '').upper())
        return '%s_API_KEY' % upper.strip('_')

    @api.onchange('template_id')
    def _onchange_template_id(self):
        """Pre-fill the route fields from the chosen template (key stays manual)."""
        template = self.template_id
        if not template:
            return
        self.route_key = template.route_key
        self.display_name = template.name
        self.api_protocol = template.api_protocol
        self.base_url = template.base_url or False
        self.thinking_format = template.thinking_format or False
        self.api_key_env = self._derive_key_ref(template.route_key)

    @api.onchange('route_key')
    def _onchange_route_key(self):
        """Prefill the display name and credential reference from the key."""
        if self.route_key and not self.display_name:
            self.display_name = self.route_key
        if self.route_key and not self.api_key_env:
            self.api_key_env = self._derive_key_ref(self.route_key)

    @api.model
    def _parse_models(self, models_text):
        """Parse the models textarea into ``models[]`` entries.

        Each non-blank line is ``id`` or ``id | Name``.

        :rtype: list
        """
        entries = []
        for line in (models_text or '').splitlines():
            line = line.strip()
            if not line:
                continue
            if '|' in line:
                model_id, name = (part.strip() for part in line.split('|', 1))
            else:
                model_id, name = line, ''
            if not model_id:
                continue
            entry = {'id': model_id}
            if name:
                entry['name'] = name
            entries.append(entry)
        return entries

    def action_create_route(self):
        """Declare the route on the harness, then sync the provider mirror.

        Manager-gated. Validates the key, builds the route profile, writes it
        with a path-scoped ``settings/mutate`` (so sibling routes are left
        intact), pushes the API key with ``credentials.set`` when one was typed,
        and syncs providers so the route appears under Providers.

        :raises UserError: when the route key is malformed.
        """
        self.ensure_one()
        self._check_manager()
        route_key = (self.route_key or '').strip()
        if not ROUTE_KEY_PATTERN.match(route_key):
            raise UserError(_(
                "Mã tuyến %s phải gồm chữ thường, chữ số hoặc dấu gạch ngang, "
                "bắt đầu bằng chữ cái hoặc chữ số.", route_key))
        api_key_env = (self.api_key_env or '').strip() or self._derive_key_ref(route_key)

        profile = {'api': self.api_protocol}
        base_url = (self.base_url or '').strip()
        if base_url:
            profile['baseURL'] = base_url
        if self.display_name:
            profile['displayName'] = self.display_name
        if api_key_env:
            profile['apiKeyEnv'] = api_key_env
        if self.thinking_format:
            profile['compat'] = {'thinkingFormat': self.thinking_format}
        models = self._parse_models(self.models_text)
        if models:
            profile['models'] = models

        client = self.env['npei.agent.harness.client'].sudo()
        described = client._rpc('settings/describe', {}) or {}
        entry = next((row for row in described.get('namespaces') or []
                      if row.get('ns') == self.settings_ns), None)
        if entry is None:
            raise UserError(_(
                "Harness không báo cáo không gian tên cài đặt %s.", self.settings_ns))
        client._rpc('settings/mutate', {
            'ns': self.settings_ns,
            'ops': [{'op': 'set', 'path': ['providers', route_key], 'value': profile}],
            'expectedRevision': entry.get('revision'),
        })
        if self.api_key:
            client._rpc('credentials/set', {'ref': api_key_env, 'value': self.api_key})

        self.env['npei.agent.provider'].action_sync_from_harness()
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _("MTIL Agent"),
                'message': _(
                    "Đã thêm tuyến %(key)s. Cấu hình mô hình trong "
                    "Nhà cung cấp > %(key)s > Mô hình đã Cấu hình.", key=route_key),
                'type': 'success',
                'sticky': False,
            },
        }
