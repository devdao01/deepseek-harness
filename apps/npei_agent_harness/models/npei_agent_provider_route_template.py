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
        string='Tên',
        required=True, tracking=True,
        help="Tên hiển thị trong wizard Thêm tuyến Nhà cung cấp.",
    )
    route_key = fields.Char(
        string='Mã tuyến',
        required=True, tracking=True,
        help="Mã tuyến mặc định (providers.<key>), ví dụ openrouter.",
    )
    api_protocol = fields.Selection(
        PROTOCOLS,
        string='Giao thức wire',
        required=True,
        default='openai-completions', tracking=True,
        help="Định dạng wire điểm cuối, gửi dưới dạng khóa `api` trong profile.",
    )
    base_url = fields.Char(
        string='URL cơ sở', tracking=True,
        help="Điểm cuối cơ sở; để trống sẽ kế thừa điểm cuối từ danh mục pi-ai "
             "cho nhà cung cấp mà nó đã có sẵn.",
    )
    thinking_format = fields.Selection(
        THINKING_FORMATS,
        string='Định dạng suy luận', tracking=True,
        help="compat.thinkingFormat cho các mô hình của tuyến; để trống để pi-ai "
             "tự đoán từ URL cơ sở.",
    )
    note = fields.Char(
        string='Ghi chú', tracking=True,
        help="Gợi ý tùy chọn (nơi lấy khóa, ví dụ model id).",
    )
    sequence = fields.Integer(string='Thứ tự', default=10)
    active = fields.Boolean(default=True, tracking=True)
    seq = fields.Integer('Trình tự*:', default=1)
    is_locked = fields.Boolean('Đã Khóa*:', tracking=True)
    uuid = fields.Char('Mã Chuỗi Ngẫu nhiên*:', copy=False, tracking=True,
                       default=lambda self: str(uuid.uuid4()))

    def act_lock(self):
        self.write({'is_locked': True})

    def act_unlock(self):
        self.write({'is_locked': False})
