# -*- coding: utf-8 -*-
"""Model discovery wizard.

Manager-only wizard that probes a provider endpoint for the models it offers via
the harness ``llm/discoverModels`` (a live network probe, not the static
catalog). Results are formatted into a read-only text box; the raw list is kept
so **Adopt** can append the discovered models into a target provider's
configurable catalog (``npei.agent.provider.model``), which pushes them into the
provider's settings namespace.
"""
import json

from odoo import _, api, fields, models
from odoo.exceptions import AccessError, UserError

MANAGER_GROUP = 'npei_agent_harness.group_npei_agent_manager'


class NpeiDiscoverModels(models.TransientModel):
    _name = 'npei.agent.discover.models'
    _description = 'DeepSeek Harness Discover Models'

    settings_ns = fields.Char(
        string='Không gian tên cài đặt',
        required=True,
        help="Không gian tên cài đặt có mặc định nhà cung cấp làm hạt giống thăm dò.",
    )
    provider = fields.Char(
        string='Nhà cung cấp',
        help="Ghi đè mã nhà cung cấp tùy chọn.",
    )
    base_url = fields.Char(
        string='URL cơ sở',
        help="Ghi đè URL cơ sở tùy chọn cho điểm cuối thăm dò.",
    )
    api_type = fields.Char(
        string='API',
        help="Ghi đè loại API nhà cung cấp tùy chọn (gửi dưới dạng tham số `api`). "
             "Đặt là api_type để không che khuất module odoo `api`.",
    )
    api_key = fields.Char(
        string='Khóa API',
        help="Khóa API tùy chọn chỉ dùng cho thăm dò này; không bao giờ được lưu.",
    )
    result_text = fields.Text(
        string='Mô hình đã khám phá',
        readonly=True,
        help="Một dòng mỗi mô hình: id, tên, cửa sổ ngữ cảnh, số token tối đa.",
    )
    result_json = fields.Text(
        string='Mô hình đã khám phá (thô)',
        readonly=True,
        help="Danh sách mô hình đã khám phá thô, được giữ để Nhận vào có thể "
             "thêm chúng vào danh mục có thể cấu hình của nhà cung cấp.",
    )
    target_provider_id = fields.Many2one(
        'npei.agent.provider',
        string='Nhận vào Nhà cung cấp',
        help="Nhà cung cấp có mô hình có thể cấu hình được thêm các mục đã khám phá "
             "khi Nhận vào chạy.",
    )

    def _check_manager(self):
        """Raise unless the current user is an NPEI Agent Manager."""
        if not self.env.user.has_group(MANAGER_GROUP):
            raise AccessError(
                _("Chỉ Quản trị Agent NPEI mới có thể khám phá mô hình."))

    @api.model
    def _format_models(self, discovered):
        """Format ``llm/discoverModels`` entries into a display block.

        :param discovered: the returned ``models`` list.
        :rtype: str
        """
        if not discovered:
            return _("Không có mô hình nào được trả về.")
        lines = []
        for model in discovered:
            parts = [model.get('id') or '']
            if model.get('name'):
                parts.append(model['name'])
            if model.get('contextWindow') is not None:
                parts.append(_("context=%s") % model['contextWindow'])
            if model.get('maxTokens') is not None:
                parts.append(_("maxTokens=%s") % model['maxTokens'])
            lines.append('  '.join(part for part in parts if part))
        return '\n'.join(lines)

    def action_discover(self):
        """Probe the provider via ``llm/discoverModels`` and show the result.

        Manager-gated. Sends ``settingsNs`` plus only the non-blank optional
        keys (``provider``/``baseURL``/``api``/``apiKey``), formats the returned
        models into :attr:`result_text`, and re-opens the wizard showing them.
        """
        self.ensure_one()
        self._check_manager()
        request = {}
        if self.provider:
            request['provider'] = self.provider
        if self.base_url:
            request['baseURL'] = self.base_url
        if self.api_type:
            request['api'] = self.api_type
        if self.api_key:
            request['apiKey'] = self.api_key
        value = self.env['npei.agent.harness.client'].sudo()._rpc(
            'llm/discoverModels', {'settingsNs': self.settings_ns, 'request': request})
        discovered = value or []
        self.result_text = self._format_models(discovered)
        self.result_json = json.dumps(discovered)
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'npei.agent.discover.models',
            'res_id': self.id,
            'view_mode': 'form',
            'target': 'new',
        }

    def action_adopt(self):
        """Append the discovered models into :attr:`target_provider_id`'s catalog.

        Manager-gated. Requires a prior Discover (``result_json``) and a target
        provider. Each discovered model becomes an ``npei.agent.provider.model``
        row unless the provider already configures that id; creating the rows
        pushes the updated ``models`` array to the harness. Re-opens the wizard.

        :raises UserError: when no target provider is set or nothing was
            discovered yet.
        """
        self.ensure_one()
        self._check_manager()
        if not self.target_provider_id:
            raise UserError(_("Hãy chọn một nhà cung cấp để nhận mô hình vào."))
        try:
            discovered = json.loads(self.result_json or '[]')
        except (ValueError, TypeError):
            discovered = []
        if not discovered:
            raise UserError(_("Hãy khám phá mô hình trước, rồi mới Nhận vào."))
        ProviderModel = self.env['npei.agent.provider.model']
        existing_ids = set(ProviderModel.search([
            ('provider_id', '=', self.target_provider_id.id)]).mapped('model_id'))
        adopted = 0
        for entry in discovered:
            model_id = entry.get('id') if isinstance(entry, dict) else None
            if not model_id or model_id in existing_ids:
                continue
            ProviderModel.create({
                'provider_id': self.target_provider_id.id,
                'model_id': model_id,
                'name': entry.get('name') or False,
                'context_window': entry.get('contextWindow') or 0,
                'max_tokens': entry.get('maxTokens') or 0,
            })
            existing_ids.add(model_id)
            adopted += 1
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'npei.agent.discover.models',
            'res_id': self.id,
            'view_mode': 'form',
            'target': 'new',
        }
